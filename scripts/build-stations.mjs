// Builds data/stations.json from public sources:
//   1. OpenStreetMap (Overpass API): every fuel station in India, with brand, name, address, hours.
//   2. IndianOil's official "List of XP100 ROs" table at https://iocl.com/xp100 (ethanol free XP100).
//   3. data/e0-manual.json: other ethanol free outlets named by the oil companies themselves.
//   4. GeoNames: nearest town and state, so people can search by place name.
//
// Run by .github/workflows/update-stations.yml. Locally: node scripts/build-stations.mjs
// (needs `npm install --no-save playwright-core` and Chrome for the IndianOil step, plus
// cities5000.txt and admin1CodesASCII.txt from https://download.geonames.org/export/dump/).

import fs from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "data/stations.json";
const UA = "COCOFinder/1.0 (+https://github.com/iraniroahn/COCOFinder)";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const BRANDS = ["IndianOil", "HP", "BPCL", "Jio-bp", "Shell", "Nayara", "Other"];
const COCO = 1;
const E0 = 2;
const H24 = 4;

const log = (...a) => console.log(...a);

// ---------- Helpers ----------

export function classifyBrand(tags) {
  const t = [tags.brand, tags.name, tags.operator, tags["brand:en"], tags["name:en"], tags.official_name]
    .filter(Boolean).join(" | ").toLowerCase();
  if (/jio|reliance/.test(t)) return "Jio-bp";
  if (/nayara|essar/.test(t)) return "Nayara";
  if (/\bshell\b/.test(t)) return "Shell";
  if (/indian ?oil|\biocl?\b|\bibp\b|\bservo\b/.test(t) || tags["brand:wikidata"] === "Q1289348") return "IndianOil";
  if (/\bhp\b|hindustan petrol|\bhpcl\b|\bh\.p\.?\b/.test(t) || tags["brand:wikidata"] === "Q1619375") return "HP";
  if (/bharat petrol|\bbpcl\b|\bbp\b/.test(t)) return "BPCL";
  return "Other";
}

// Stations that only sell CNG or LPG are not petrol pumps.
export function isGasOnly(tags, brand) {
  if (brand !== "Other") return false;
  const t = [tags.brand, tags.name, tags.operator].filter(Boolean).join(" ").toLowerCase();
  return /\b(cng|lpg|png)\b|\bigl\b|\bmgl\b|gail gas|adani (total )?gas|gas station|autogas/.test(t);
}

export function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim()
    .replace(/(^|[\s(/.-])([a-z])/g, (m, p, c) => p + c.toUpperCase())
    .replace(/\b(Ro|Coco|Ioc|Iocl|Hp|Bp|Bpcl|Hpcl|Nh|Sh|Ltd)\b/g, (m) => m.toUpperCase());
}

function distKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Simple spatial grid for nearest-neighbour lookups.
class Grid {
  constructor(cell = 0.25) { this.cell = cell; this.map = new Map(); }
  key(lat, lng) { return `${Math.floor(lat / this.cell)}:${Math.floor(lng / this.cell)}`; }
  add(item) {
    const k = this.key(item.lat, item.lng);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(item);
  }
  nearest(p, maxKm, filter = () => true) {
    const r = Math.ceil(maxKm / (111 * this.cell)) + 1;
    const ci = Math.floor(p.lat / this.cell);
    const cj = Math.floor(p.lng / this.cell);
    let best = null;
    let bestD = maxKm;
    for (let i = ci - r; i <= ci + r; i++) {
      for (let j = cj - r; j <= cj + r; j++) {
        for (const it of this.map.get(`${i}:${j}`) || []) {
          if (!filter(it)) continue;
          const d = distKm(p, it);
          if (d <= bestD) { bestD = d; best = it; }
        }
      }
    }
    return best ? { item: best, km: bestD } : null;
  }
}

function inIndia(lat, lng) {
  return lat > 6 && lat < 37.5 && lng > 68 && lng < 98;
}

// ---------- 1. OpenStreetMap ----------

// Uses curl rather than fetch: Node's fetch could not connect to overpass-api.de from GitHub runners.
function overpass(query, timeoutSec) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const body = execFileSync("curl", [
        "-sS", "--fail-with-body", "--max-time", String(timeoutSec + 60), "-A", UA,
        "--data-urlencode", `data@-`, url,
      ], { input: query, maxBuffer: 1024 * 1024 * 1024 });
      return JSON.parse(body.toString("utf8"));
    } catch (e) {
      lastErr = new Error(`${url}: ${String(e.stderr || e.message).trim().slice(0, 300)}`);
    }
    log(`  overpass attempt ${attempt + 1} failed: ${lastErr.message}`);
    sleepSync(20000 * (attempt + 1));
  }
  throw lastErr;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fetchOsmStations() {
  const all = new Map();
  const add = (data) => {
    for (const el of data.elements) {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) continue;
      all.set(`${el.type}/${el.id}`, { lat, lng, tags: el.tags || {} });
    }
  };
  const query = (bbox, t) =>
    `[out:json][timeout:${t}][maxsize:2000000000];area["ISO3166-1"="IN"][admin_level=2]->.in;nwr["amenity"="fuel"](area.in)${bbox};out center tags qt;`;
  try {
    add(overpass(query("", 900), 900));
    log(`  all India in one query: ${all.size}`);
  } catch (e) {
    // Fall back to four large tiles if the single query is refused.
    log(`  single query failed (${e.message}), trying tiles`);
    for (const [s, w, n, e2] of [[6, 68, 22, 83], [6, 83, 22, 98], [22, 68, 37.5, 83], [22, 83, 37.5, 98]]) {
      add(overpass(query(`(${s},${w},${n},${e2})`, 600), 600));
      log(`  tile ${s},${w}: total ${all.size}`);
      sleepSync(5000);
    }
  }
  return [...all.values()];
}

function osmAddress(t) {
  if (t["addr:full"]) return t["addr:full"];
  const parts = [
    [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "),
    t["addr:place"] || t["addr:suburb"] || t["addr:neighbourhood"],
    t["addr:city"] || t["addr:district"],
    t["addr:postcode"],
  ].filter(Boolean);
  return parts.join(", ");
}

// ---------- 2. IndianOil XP100 list ----------

async function fetchXp100() {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await (await browser.newContext({ locale: "en-IN" })).newPage();
    await page.goto("https://iocl.com/xp100", { waitUntil: "domcontentloaded", timeout: 120000 });
    // The site sits behind a bot check that reloads the page once it passes.
    await page.waitForFunction(() => [...document.querySelectorAll("table th")].some((th) => /latitude/i.test(th.textContent)), null, { timeout: 120000 });
    const rows = await page.$$eval("table", (tables) => {
      const t = tables.find((x) => [...x.querySelectorAll("th")].some((th) => /latitude/i.test(th.textContent)));
      const head = [...t.querySelectorAll("th")].map((th) => th.textContent.trim().toUpperCase());
      return [...t.querySelectorAll("tbody tr")].map((tr) => {
        const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim());
        return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
      });
    });
    const out = [];
    for (const r of rows) {
      let lat = parseFloat(r.LATITUDE);
      let lng = parseFloat(r.LONGITUDE);
      if (inIndia(lng, lat) && !inIndia(lat, lng)) [lat, lng] = [lng, lat]; // swapped columns
      if (!inIndia(lat, lng)) { log(`  skip XP100 row with bad coordinates: ${JSON.stringify(r)}`); continue; }
      out.push({ code: r["RO CODE"], name: titleCase(r["RO NAME"]), city: titleCase(r.CITY), lat, lng });
    }
    log(`  XP100 rows: ${rows.length}, usable: ${out.length}`);
    return out;
  } finally {
    await browser.close();
  }
}

// ---------- 3. GeoNames places ----------

function loadPlaces() {
  if (!fs.existsSync("cities5000.txt")) { log("  GeoNames file missing, skipping place names"); return null; }
  const states = new Map();
  if (fs.existsSync("admin1CodesASCII.txt")) {
    for (const line of fs.readFileSync("admin1CodesASCII.txt", "utf8").split("\n")) {
      const [code, name] = line.split("\t");
      if (code && code.startsWith("IN.")) states.set(code, name);
    }
  }
  const grid = new Grid(0.5);
  let n = 0;
  for (const line of fs.readFileSync("cities5000.txt", "utf8").split("\n")) {
    const f = line.split("\t");
    if (f[8] !== "IN") continue;
    grid.add({ name: f[2], lat: +f[4], lng: +f[5], state: states.get(`IN.${f[10]}`) || "", pop: +f[14] });
    n++;
  }
  log(`  GeoNames places: ${n}`);
  return grid;
}

function areaLabel(places, p, fallbackTags = {}) {
  if (places) {
    const hit = places.nearest(p, 60);
    if (hit) return [hit.km > 15 ? `near ${hit.item.name}` : hit.item.name, hit.item.state].filter(Boolean).join(", ");
  }
  return [fallbackTags["addr:city"] || fallbackTags["addr:district"], fallbackTags["addr:state"]].filter(Boolean).join(", ");
}

// ---------- Build ----------

async function main() {
  log("OpenStreetMap...");
  const osm = fetchOsmStations();
  if (osm.length < 5000) throw new Error(`Only ${osm.length} OSM stations, refusing to overwrite data`);

  const places = loadPlaces();

  const stations = [];
  const grid = new Grid(0.05);
  let gasOnly = 0;
  for (const { lat, lng, tags } of osm) {
    const brand = classifyBrand(tags);
    if (isGasOnly(tags, brand)) { gasOnly++; continue; }
    const name = (tags.name || tags["name:en"] || tags.official_name || "").trim();
    let flags = 0;
    if (/\bcoco\b/i.test(`${name} ${tags.operator || ""}`)) flags |= COCO;
    if (/^24\/7$/.test((tags.opening_hours || "").trim())) flags |= H24;
    const s = { lat, lng, brand, name, flags, area: areaLabel(places, { lat, lng }, tags), address: osmAddress(tags) };
    stations.push(s);
    grid.add(s);
  }
  log(`  kept ${stations.length}, dropped ${gasOnly} gas only`);

  log("IndianOil XP100...");
  let xpMatched = 0;
  let xpAdded = 0;
  try {
    for (const ro of await fetchXp100()) {
      const hit = grid.nearest(ro, 0.3, (s) => s.brand === "IndianOil" || s.brand === "Other");
      const coco = /\bcoco\b/i.test(ro.name) ? COCO : 0;
      if (hit) {
        const s = hit.item;
        s.flags |= E0 | coco;
        s.brand = "IndianOil";
        s.name = ro.name;
        xpMatched++;
      } else {
        const s = { lat: ro.lat, lng: ro.lng, brand: "IndianOil", name: ro.name, flags: E0 | coco, area: areaLabel(places, ro) || ro.city, address: "" };
        stations.push(s);
        grid.add(s);
        xpAdded++;
      }
    }
  } catch (e) {
    // Keep the XP100 flags from the previous build rather than silently dropping them.
    log(`  XP100 fetch failed: ${e.message}`);
    if (!fs.existsSync(OUT)) throw e;
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
    for (const r of prev.stations) {
      if (!(r[4] & E0) || prev.brands[r[2]] !== "IndianOil") continue;
      const p = { lat: r[0], lng: r[1] };
      const hit = grid.nearest(p, 0.05);
      if (hit) { hit.item.flags |= E0; hit.item.name = r[3]; xpMatched++; }
      else { stations.push({ ...p, brand: "IndianOil", name: r[3], flags: r[4], area: r[5], address: r[6] || "" }); xpAdded++; }
    }
    log("  reused XP100 outlets from the previous build");
  }
  log(`  XP100 matched to OSM: ${xpMatched}, added from official coordinates: ${xpAdded}`);

  log("Manual ethanol free outlets...");
  const manual = JSON.parse(fs.readFileSync("data/e0-manual.json", "utf8"));
  for (const m of manual.outlets) {
    const re = new RegExp(m.match, "i");
    const hit = grid.nearest({ lat: m.near[0], lng: m.near[1] }, m.radiusKm,
      (s) => s.brand === m.brand && re.test(`${s.name} ${s.address}`));
    if (hit) { hit.item.flags |= E0; log(`  ${m.label}: matched "${hit.item.name}" ${hit.km.toFixed(2)} km away`); }
    else log(`  ${m.label}: no matching ${m.brand} pump found in OpenStreetMap, skipped`);
  }

  const round = (x) => Math.round(x * 1e5) / 1e5;
  stations.sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    sources: {
      osm: "© OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/copyright",
      xp100: "IndianOil list of XP100 ROs, https://iocl.com/xp100",
      places: "GeoNames, CC BY 4.0, https://www.geonames.org/",
      manual: "data/e0-manual.json",
    },
    fields: ["lat", "lng", "brandIndex", "name", "flags(1=COCO,2=E0,4=24x7)", "area", "address"],
    brands: BRANDS,
    stations: stations.map((s) => {
      const row = [round(s.lat), round(s.lng), BRANDS.indexOf(s.brand), s.name, s.flags, s.area];
      if (s.address) row.push(s.address);
      return row;
    }),
  };
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out).replace(/\],\[/g, "],\n["));

  const count = (f) => stations.filter(f).length;
  log("Summary");
  for (const b of BRANDS) log(`  ${b}: ${count((s) => s.brand === b)}`);
  log(`  E0: ${count((s) => s.flags & E0)}, COCO: ${count((s) => s.flags & COCO)}, 24x7: ${count((s) => s.flags & H24)}`);
  log(`  file size: ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
}

if (process.argv[1] && process.argv[1].endsWith("build-stations.mjs")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

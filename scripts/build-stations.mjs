// Builds data/stations.json from public sources:
//   1. OpenStreetMap (Geofabrik India extract): every fuel station in India, with brand, name, address, hours.
//   2. IndianOil's official "List of XP100 ROs" table at https://iocl.com/xp100 (ethanol free XP100).
//   3. data/e0-manual.json: other ethanol free outlets named by the oil companies themselves.
//   4. Place names: neighbourhood and city from OpenStreetMap, state from GeoNames, so people can
//      search by place name.
//
// Run by .github/workflows/update-stations.yml, which downloads the inputs first:
// fuel.geojsonseq (see readOsmExtract), cities5000.txt and admin1CodesASCII.txt from GeoNames,
// and playwright-core plus Chrome for the IndianOil step.

import fs from "node:fs";

const OUT = "data/stations.json";

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
  if (/indian ?oil|india oil|\biocl?\b|\bibp\b|\bservo\b|assam oil/.test(t) || tags["brand:wikidata"] === "Q1289348") return "IndianOil";
  if (/\bhp\b|\bh\.? ?p\b|hindust?h?an petrol|\bhpcl\b/.test(t) || tags["brand:wikidata"] === "Q1619375") return "HP";
  if (/b?h?aratt?h? petrol|\bbpcl\b|\bbp\b|^bharath?$/.test(t)) return "BPCL";
  return "Other";
}

// Stations that only sell CNG or LPG are not petrol pumps.
export function isGasOnly(tags, brand) {
  if (brand !== "Other") return false;
  const t = [tags.brand, tags.name, tags.operator].filter(Boolean).join(" ").toLowerCase();
  return /\b(cng|lpg|png|gas|gail|igl|mgl|mngl)\b|autogas/.test(t);
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
export class Grid {
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

// Reads fuel stations exported from Geofabrik's India extract by the workflow:
//   osmium tags-filter india-latest.osm.pbf nwr/amenity=fuel -o fuel.osm.pbf
//   osmium export fuel.osm.pbf -f geojsonseq -o fuel.geojsonseq
function centroid(g) {
  if (!g) return null;
  const avg = (pts) => pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : null;
  switch (g.type) {
    case "Point": return g.coordinates;
    case "LineString": return avg(g.coordinates);
    case "Polygon": return avg(g.coordinates[0]);
    case "MultiPolygon": return avg(g.coordinates[0][0]);
    default: return null;
  }
}

export function readOsmExtract(file) {
  const out = [];
  const seen = new Grid(0.05);
  // Nodes first, so a pump mapped as both a point and a building outline is kept once.
  const features = fs.readFileSync(file, "utf8").split("\n")
    .map((l) => l.replace(/^\x1e/, "").trim()).filter(Boolean).map((l) => JSON.parse(l))
    .sort((x, y) => (x.geometry.type === "Point" ? 0 : 1) - (y.geometry.type === "Point" ? 0 : 1));
  for (const f of features) {
    const c = centroid(f.geometry);
    if (!c) continue;
    const p = { lat: c[1], lng: c[0] };
    if (seen.nearest(p, 0.03)) continue;
    const tags = { ...f.properties };
    delete tags["@type"];
    delete tags["@id"];
    const s = { ...p, tags };
    seen.add(s);
    out.push(s);
  }
  return out;
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

// Loads GeoNames towns in and around India, used for the state name and as a fallback place name.
function loadPlaces() {
  if (!fs.existsSync("cities5000.txt")) throw new Error("cities5000.txt missing (download it from GeoNames)");
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
    const lat = +f[4];
    const lng = +f[5];
    if (!(lat > 0 && lat < 42 && lng > 60 && lng < 102)) continue;
    grid.add({ name: f[2], lat, lng, country: f[8], state: f[8] === "IN" ? states.get(`IN.${f[10]}`) || "" : "" });
    if (f[8] === "IN") n++;
  }
  log(`  GeoNames places in India: ${n}`);
  return grid;
}

// OpenStreetMap place names (neighbourhoods, suburbs, villages, towns, cities) from the same
// extract, exported by the workflow as places.geojsonseq. They are far denser than GeoNames,
// which only knows "Mumbai" as a single point and would label Colaba as Dharavi.
const LOCAL_TYPES = new Set(["suburb", "quarter", "neighbourhood"]);

export function loadOsmPlaces(file) {
  if (!fs.existsSync(file)) { log(`  ${file} missing, place names will be coarse`); return null; }
  const grid = new Grid(0.1);
  let n = 0;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const l = line.replace(/^\x1e/, "").trim();
    if (!l) continue;
    const f = JSON.parse(l);
    const t = f.properties || {};
    const name = (t["name:en"] || t.name || "").trim();
    const c = centroid(f.geometry);
    if (!name || !t.place || !c) continue;
    grid.add({ lat: c[1], lng: c[0], name, type: t.place });
    n++;
  }
  log(`  OpenStreetMap places: ${n}`);
  return grid;
}

// "Neighbourhood, City, State", e.g. "Colaba, Mumbai, Maharashtra".
export function areaLabel(geo, osmPlaces, p, tags = {}) {
  const parts = [];
  if (osmPlaces) {
    const local = osmPlaces.nearest(p, 2, (x) => LOCAL_TYPES.has(x.type))
      || osmPlaces.nearest(p, 3, (x) => x.type === "village" || x.type === "town");
    const city = osmPlaces.nearest(p, 15, (x) => x.type === "city")
      || osmPlaces.nearest(p, 8, (x) => x.type === "town")
      || osmPlaces.nearest(p, 30, (x) => x.type === "city");
    if (local) parts.push(local.item.name);
    if (city) parts.push(city.item.name);
  }
  if (!parts.length) {
    const fromTags = tags["addr:suburb"] || tags["addr:city"] || tags["addr:district"];
    if (fromTags) parts.push(fromTags);
  }
  const hit = geo ? geo.nearest(p, 60, (x) => x.country === "IN") : null;
  if (!parts.length && hit) parts.push(hit.km > 15 ? `near ${hit.item.name}` : hit.item.name);
  const state = hit ? hit.item.state : tags["addr:state"];
  if (state) parts.push(state);
  return parts.filter((x, i) => x && parts.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).join(", ");
}

// ---------- Build ----------

async function main() {
  log("OpenStreetMap...");
  const places = loadPlaces();
  const osmPlaces = loadOsmPlaces("places.geojsonseq");
  const osm = readOsmExtract("fuel.geojsonseq");
  log(`  fuel stations in the extract: ${osm.length}`);
  if (osm.length < 10000) throw new Error(`Only ${osm.length} OSM stations, refusing to overwrite data`);

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
    const s = { lat, lng, brand, name, flags, area: areaLabel(places, osmPlaces, { lat, lng }, tags), address: osmAddress(tags) };
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
        const s = { lat: ro.lat, lng: ro.lng, brand: "IndianOil", name: ro.name, flags: E0 | coco, area: areaLabel(places, osmPlaces, ro) || ro.city, address: "" };
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
      osm: "© OpenStreetMap contributors, ODbL, via Geofabrik. https://www.openstreetmap.org/copyright",
      xp100: "IndianOil list of XP100 ROs, https://iocl.com/xp100",
      places: "Neighbourhood and city names from OpenStreetMap; states from GeoNames, CC BY 4.0, https://www.geonames.org/",
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

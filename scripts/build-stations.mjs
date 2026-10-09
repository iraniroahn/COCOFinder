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
  all() {
    return [...this.map.values()].flat();
  }
  within(p, maxKm, filter = () => true) {
    const r = Math.ceil(maxKm / (111 * this.cell)) + 1;
    const ci = Math.floor(p.lat / this.cell);
    const cj = Math.floor(p.lng / this.cell);
    const out = [];
    for (let i = ci - r; i <= ci + r; i++) {
      for (let j = cj - r; j <= cj + r; j++) {
        for (const it of this.map.get(`${i}:${j}`) || []) {
          if (!filter(it)) continue;
          const d = distKm(p, it);
          if (d <= maxKm) out.push({ item: it, km: d });
        }
      }
    }
    return out;
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
    grid.add({ lat: c[1], lng: c[0], name, type: t.place, pop: parseInt(String(t.population || "").replace(/[^0-9]/g, ""), 10) || 0 });
    n++;
  }
  log(`  OpenStreetMap places: ${n}`);
  return grid;
}

// ---------- Administrative boundaries ----------

// State (admin_level 4) and district (admin_level 5) outlines from the same extract, exported by
// the workflow as admin.geojsonseq. Used so labels respect borders: a pump in East Delhi must not
// be labelled Noida, and one in Gurugram must say Haryana, whatever town point happens to be closest.
function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonsContain(polys, x, y) {
  return polys.some((rings) => ringContains(rings[0], x, y) && !rings.slice(1).some((h) => ringContains(h, x, y)));
}

// "Navi Mumbai Municipal Corporation" -> "Navi Mumbai", "Greater Hyderabad Municipal Corporation"
// -> "Hyderabad", "Brihanmumbai Municipal Corporation" -> "Mumbai". Null for anything else.
const CORP_RE = /municipal corporation|municipal council|municipality|nagar nigam|mahanagar ?palika|mahanagara palike|nagar palika|city corporation|\bcorporation\b/i;
export function corpCityName(name) {
  if (!CORP_RE.test(name || "")) return null;
  let n = name
    .replace(/\b(city municipal corporation|municipal corporation|municipal council|municipality|nagar nigam|mahanagar ?palika|mahanagara palike|nagar palika parishad|nagar palika|city corporation|corporation)\b/gi, " ")
    .replace(/\bof\b/gi, " ").replace(/[(),]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b(muncipal|municipal|limits|urban)\b/gi, " ").replace(/\s+/g, " ").trim()
    .replace(/^(greater|bruhat|brihat)\s+/i, "")
    .replace(/\s+(north|south|east|west|central)$/i, "");
  if (/^brihan ?mumbai$/i.test(n)) n = "Mumbai";
  return n.length >= 3 && /^[\x20-\x7E]+$/.test(n) ? n : null;
}

const normName = (n) => String(n || "").toLowerCase().replace(/[^a-z]/g, "");

// cityPlaces: OpenStreetMap city and town points. A level 7-8 area counts as a city boundary when
// it is named like a municipal corporation, or when a city/town point of the same name lies in it
// (OSM often names city boundaries just "Navi Mumbai" or "Pune").
export function makeAdmin(features, cityPlaces = []) {
  const levels = { 4: [], 5: [], corp: [] };
  for (const f of features) {
    const t = f.properties || {};
    let level = Number(t.admin_level);
    if (level >= 6 && level <= 8) {
      const raw = t["name:en"] || t.name;
      let city = corpCityName(raw);
      if (!city && level >= 7 && f.geometry) {
        const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates]
          : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
        const named = cityPlaces.find((c) => normName(c.name) === normName(raw) && polygonsContain(polys, c.lng, c.lat));
        if (named) city = named.name;
      }
      if (!city) continue;
      t["name:en"] = city;
      t.admin_level_num = level;
      level = "corp";
    }
    if (!levels[level] || !f.geometry) continue;
    const name = (t["name:en"] || t.name || "").replace(/\s+district$/i, "").trim();
    if (!name) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates]
      : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : null;
    if (!polys) continue;
    let [w, s, e, n] = [180, 90, -180, -90];
    for (const rings of polys) for (const [x, y] of rings[0]) {
      if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
    }
    levels[level].push({ name, polys, bbox: [w, s, e, n], rank: t.admin_level_num || 0 });
  }
  // Most specific first, so a level 8 city boundary wins over a level 6 one around it.
  levels.corp.sort((a, b) => b.rank - a.rank);
  const find = (list, p) => list.find((a) => p.lng >= a.bbox[0] && p.lng <= a.bbox[2] && p.lat >= a.bbox[1] && p.lat <= a.bbox[3]
    && polygonsContain(a.polys, p.lng, p.lat)) || null;
  const memoized = (list) => {
    const memo = new WeakMap();
    return (p) => {
      if (memo.has(p)) return memo.get(p);
      const a = find(list, p);
      memo.set(p, a);
      return a;
    };
  };
  return {
    counts: { states: levels[4].length, districts: levels[5].length, corporations: levels.corp.length },
    corpNames: levels.corp.map((a) => a.name),
    state: (p) => find(levels[4], p),
    district: memoized(levels[5]),
    corp: memoized(levels.corp),
  };
}

export async function loadAdmin(file, osmPlaces) {
  if (!fs.existsSync(file)) { log(`  ${file} missing, labels will not respect borders`); return null; }
  const { createInterface } = await import("node:readline");
  const features = [];
  for await (const line of createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })) {
    const l = line.replace(/^\x1e/, "").trim();
    if (!l) continue;
    const f = JSON.parse(l);
    const t = f.properties || {};
    const level = Number(t.admin_level);
    // Keep states, districts and city corporations; drop the many other level 6-8 areas early.
    if (level === 4 || level === 5 || (level >= 6 && level <= 8 && corpCityName(t["name:en"] || t.name))
      || ((level === 7 || level === 8) && (t["name:en"] || t.name))) features.push(f);
  }
  const cityPlaces = osmPlaces ? osmPlaces.all().filter((x) => x.type === "city" || x.type === "town") : [];
  const admin = makeAdmin(features, cityPlaces);
  log(`  boundaries: ${admin.counts.states} states, ${admin.counts.districts} districts, ${admin.counts.corporations} city corporations`);
  log(`  e.g. ${[...new Set(admin.corpNames)].slice(0, 40).join(", ")}`);
  return admin;
}

// Rough radius of a city's built-up area, from its population: a pump farther out than this is
// "near" the city rather than in it.
function cityRadiusKm(x) {
  const pop = x.pop || (x.type === "city" ? 300000 : 30000);
  return Math.min(25, Math.max(3, 12 * Math.sqrt(pop / 1e6)));
}

// Picks the city or town a point belongs to. Distance is weighted by population so a big city
// wins over a smaller twin in the same district (Jubilee Hills is Hyderabad, not Secunderabad),
// while a separate town right next to the point still wins.
function pickCity(osmPlaces, p, same) {
  const weight = (x) => Math.sqrt(Math.max(x.pop || (x.type === "city" ? 300000 : 30000), 20000));
  const best = (list) => list.length ? list.reduce((a, b) => (a.km / weight(a.item) <= b.km / weight(b.item) ? a : b)) : null;
  return best([
    ...osmPlaces.within(p, 15, (x) => x.type === "city" && same(x)),
    ...osmPlaces.within(p, 8, (x) => x.type === "town" && same(x)),
  ]) || osmPlaces.nearest(p, 30, (x) => x.type === "city" && same(x));
}

// "Neighbourhood, City, State", e.g. "Colaba, Mumbai, Maharashtra". When boundaries are available,
// the neighbourhood and city must be in the pump's own district; if no city point is, the district
// name is used instead (e.g. "Gharoli, East Delhi, Delhi").
export function areaLabel(geo, osmPlaces, p, tags = {}, admin = null) {
  const parts = [];
  const district = admin ? admin.district(p) : null;
  const corp = admin ? admin.corp(p) : null;
  const same = (x) => !district || admin.district(x) === district;
  if (osmPlaces) {
    const local = osmPlaces.nearest(p, 2, (x) => LOCAL_TYPES.has(x.type) && same(x))
      || osmPlaces.nearest(p, 3, (x) => (x.type === "village" || x.type === "town") && same(x));
    if (local) parts.push(local.item.name);
    if (corp) {
      // Inside a city corporation: name a city point within it (Secunderabad inside Greater
      // Hyderabad), otherwise the corporation's city name.
      const city = pickCity(osmPlaces, p, (x) => admin.corp(x) === corp);
      parts.push(city ? city.item.name : corp.name);
    } else {
      const city = pickCity(osmPlaces, p, same);
      // An urban neighbourhood means the pump is in the city; a village or nothing may mean it's outside.
      const urban = local && LOCAL_TYPES.has(local.item.type);
      if (city) parts.push(!urban && city.km > cityRadiusKm(city.item) ? `near ${city.item.name}` : city.item.name);
      else if (district) parts.push(district.name);
    }
  } else if (corp || district) {
    parts.push((corp || district).name);
  }
  if (!parts.length) {
    const fromTags = tags["addr:suburb"] || tags["addr:city"] || tags["addr:district"];
    if (fromTags) parts.push(fromTags);
  }
  const hit = geo ? geo.nearest(p, 60, (x) => x.country === "IN") : null;
  if (!parts.length && hit) parts.push(hit.km > 15 ? `near ${hit.item.name}` : hit.item.name);
  const stateArea = admin ? admin.state(p) : null;
  const state = stateArea ? stateArea.name : hit ? hit.item.state : tags["addr:state"];
  if (state) parts.push(state);
  return parts.filter((x, i) => x && parts.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).join(", ");
}

// ---------- Build ----------

async function main() {
  log("OpenStreetMap...");
  const places = loadPlaces();
  const osmPlaces = loadOsmPlaces("places.geojsonseq");
  const admin = await loadAdmin("admin.geojsonseq", osmPlaces);
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
    const s = { lat, lng, brand, name, flags, area: areaLabel(places, osmPlaces, { lat, lng }, tags, admin), address: osmAddress(tags) };
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
        const s = { lat: ro.lat, lng: ro.lng, brand: "IndianOil", name: ro.name, flags: E0 | coco, area: areaLabel(places, osmPlaces, ro, {}, admin) || ro.city, address: "" };
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

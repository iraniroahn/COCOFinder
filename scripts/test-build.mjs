// Quick checks for the pure helpers in build-stations.mjs. Run: node scripts/test-build.mjs
import assert from "node:assert/strict";
import { classifyBrand, isGasOnly, titleCase, areaLabel, Grid, makeAdmin, corpCityName } from "./build-stations.mjs";

const cases = [
  [{ brand: "Indian Oil", name: "Indian Oil" }, "IndianOil"],
  [{ name: "IOCL COCO Manesar" }, "IndianOil"],
  [{ brand: "IBP", name: "IBP Petrol" }, "IndianOil"],
  [{ brand: "Hindustan Petroleum", name: "HP Petrol Pump" }, "HP"],
  [{ name: "HP COCO", operator: "HPCL" }, "HP"],
  [{ brand: "Bharat Petroleum", name: "Sai Fuels" }, "BPCL"],
  [{ name: "BPCL Petrol Pump" }, "BPCL"],
  [{ brand: "Jio-bp", name: "Jio-bp" }, "Jio-bp"],
  [{ brand: "Reliance", name: "Reliance Petrol Pump" }, "Jio-bp"],
  [{ brand: "Nayara", name: "Nayara Petrol Pump" }, "Nayara"],
  [{ name: "Essar Petrol Pump" }, "Nayara"],
  [{ brand: "Shell", name: "Shell" }, "Shell"],
  [{ name: "Sharma Filling Station" }, "Other"],
  [{ name: "Bharat Service Station" }, "Other"],
  [{ "brand:wikidata": "Q1289348", name: "Ashoka Fuels" }, "IndianOil"],
  [{ name: "h p" }, "HP"],
  [{ name: "Hindusthan Petroleum" }, "HP"],
  [{ name: "Bharath Petroleum" }, "BPCL"],
  [{ name: "Barath Petroleum" }, "BPCL"],
  [{ name: "Bharat" }, "BPCL"],
  [{ name: "Assam Oil" }, "IndianOil"],
  [{ name: "India Oil" }, "IndianOil"],
  [{ name: "Shiva Hp Petrol Pump" }, "HP"],
  [{ name: "Happy Fuels" }, "Other"],
];
for (const [tags, want] of cases) assert.equal(classifyBrand(tags), want, JSON.stringify(tags));

assert.equal(isGasOnly({ name: "IGL CNG Station" }, "Other"), true);
assert.equal(isGasOnly({ name: "Indian Oil CNG" }, "IndianOil"), false);
assert.equal(isGasOnly({ name: "Sharma Filling Station" }, "Other"), false);
assert.equal(isGasOnly({ name: "Go Gas" }, "Other"), true);
assert.equal(isGasOnly({ name: "Mahanagar Gas" }, "Other"), true);
assert.equal(isGasOnly({ name: "Petrol Pump" }, "Other"), false);

assert.equal(titleCase("LANSDOWNE SER. STN(I-714)"), "Lansdowne Ser. Stn(I-714)");
assert.equal(titleCase("IOC COCO MASJID MOTH"), "IOC COCO Masjid Moth");
assert.equal(titleCase("Swagat RO Jasidih"), "Swagat RO Jasidih");
// Place labels: South Mumbai pumps used to be labelled Dharavi or Kegaon (nearest GeoNames points).
const grid = (items, cell) => { const g = new Grid(cell); items.forEach((x) => g.add(x)); return g; };
const geo = grid([
  { name: "Dharavi", lat: 19.0383, lng: 72.8483, country: "IN", state: "Maharashtra" },
  { name: "Kegaon", lat: 18.9125, lng: 72.9447, country: "IN", state: "Maharashtra" },
  { name: "Mumbai", lat: 19.0728, lng: 72.8826, country: "IN", state: "Maharashtra" },
  { name: "Lonavla", lat: 18.7546, lng: 73.4062, country: "IN", state: "Maharashtra" },
], 0.5);
const osmPlaces = grid([
  { name: "Mumbai", lat: 18.9388, lng: 72.8354, type: "city" },
  { name: "Colaba", lat: 18.9067, lng: 72.8147, type: "suburb" },
  { name: "Fort", lat: 18.9338, lng: 72.8356, type: "neighbourhood" },
  { name: "Breach Candy", lat: 18.9696, lng: 72.8058, type: "neighbourhood" },
  { name: "Dharavi", lat: 19.0400, lng: 72.8520, type: "suburb" },
  { name: "Lonavala", lat: 18.7546, lng: 73.4062, type: "town" },
], 0.1);
assert.equal(areaLabel(geo, osmPlaces, { lat: 18.96558, lng: 72.80335 }), "Breach Candy, Mumbai, Maharashtra");
assert.equal(areaLabel(geo, osmPlaces, { lat: 18.9338, lng: 72.8330 }), "Fort, Mumbai, Maharashtra");
assert.equal(areaLabel(geo, osmPlaces, { lat: 19.0410, lng: 72.8530 }), "Dharavi, Mumbai, Maharashtra");
assert.equal(areaLabel(geo, osmPlaces, { lat: 18.7550, lng: 73.4060 }), "Lonavala, Maharashtra");
// No OpenStreetMap place nearby: fall back to the nearest GeoNames town.
assert.equal(areaLabel(geo, osmPlaces, { lat: 18.85, lng: 73.30 }), "near Lonavla, Maharashtra");
assert.equal(areaLabel(geo, null, { lat: 19.0390, lng: 72.8490 }), "Dharavi, Maharashtra");

// Borders: an East Delhi pump next to Noida, and a Gurugram pump nearest to a Delhi town point.
const box = (w, s2, e, n) => ({ type: "Polygon", coordinates: [[[w, s2], [e, s2], [e, n], [w, n], [w, s2]]] });
const area = (name, level, geom) => ({ properties: { name, admin_level: String(level), boundary: "administrative" }, geometry: geom });
const admin = makeAdmin([
  area("Delhi", 4, box(77.0, 28.5, 77.345, 28.9)),
  area("Haryana", 4, { type: "MultiPolygon", coordinates: [box(76.8, 28.3, 77.0, 28.9).coordinates, box(77.0, 28.3, 77.345, 28.5).coordinates] }),
  area("Uttar Pradesh", 4, box(77.345, 28.3, 77.6, 28.9)),
  area("East Delhi", 5, box(77.25, 28.55, 77.345, 28.7)),
  area("New Delhi", 5, box(77.15, 28.55, 77.25, 28.7)),
  area("Gautam Buddha Nagar District", 5, box(77.345, 28.3, 77.6, 28.7)),
  area("Gurugram", 5, box(76.8, 28.3, 77.345, 28.5)),
]);
const ncrPlaces = grid([
  { name: "Delhi", lat: 28.6139, lng: 77.2090, type: "city" },
  { name: "Noida", lat: 28.5355, lng: 77.3910, type: "city" },
  { name: "Gurgaon", lat: 28.4595, lng: 77.0266, type: "city" },
  { name: "Gharoli", lat: 28.6105, lng: 77.3330, type: "neighbourhood" },
  { name: "Sector 52A", lat: 28.4400, lng: 77.0880, type: "neighbourhood" },
], 0.1);
const ncrGeo = grid([{ name: "Delhi", lat: 28.65, lng: 77.23, country: "IN", state: "Delhi" }], 0.5);
assert.equal(areaLabel(ncrGeo, ncrPlaces, { lat: 28.60734, lng: 77.33539 }, {}, admin), "Gharoli, East Delhi, Delhi");
assert.equal(areaLabel(ncrGeo, ncrPlaces, { lat: 28.43838, lng: 77.08962 }, {}, admin), "Sector 52A, Gurgaon, Haryana");
assert.equal(areaLabel(ncrGeo, ncrPlaces, { lat: 28.57, lng: 77.36 }, {}, admin), "Noida, Uttar Pradesh");
assert.equal(areaLabel(ncrGeo, ncrPlaces, { lat: 28.62, lng: 77.20 }, {}, admin), "Delhi");
assert.equal(admin.district({ lat: 28.4, lng: 77.5 }).name, "Gautam Buddha Nagar");

// Twin cities in one district: population decides unless the smaller one is much closer.
const hydPlaces = grid([
  { name: "Hyderabad", lat: 17.3850, lng: 78.4867, type: "city", pop: 6809970 },
  { name: "Secunderabad", lat: 17.4399, lng: 78.4983, type: "city", pop: 217910 },
  { name: "Jubilee Hills", lat: 17.4326, lng: 78.4071, type: "suburb" },
  { name: "Marredpally", lat: 17.4480, lng: 78.5040, type: "suburb" },
], 0.1);
const hydGeo = grid([{ name: "Hyderabad", lat: 17.38, lng: 78.48, country: "IN", state: "Telangana" }], 0.5);
assert.equal(areaLabel(hydGeo, hydPlaces, { lat: 17.4380, lng: 78.3996 }), "Jubilee Hills, Hyderabad, Telangana");
assert.equal(areaLabel(hydGeo, hydPlaces, { lat: 17.4470, lng: 78.5030 }), "Marredpally, Secunderabad, Telangana");

// City corporation names.
assert.equal(corpCityName("Navi Mumbai Municipal Corporation"), "Navi Mumbai");
assert.equal(corpCityName("Greater Hyderabad Municipal Corporation"), "Hyderabad");
assert.equal(corpCityName("Brihanmumbai Municipal Corporation"), "Mumbai");
assert.equal(corpCityName("Bruhat Bengaluru Mahanagara Palike"), "Bengaluru");
assert.equal(corpCityName("Municipal Corporation of Delhi"), "Delhi");
assert.equal(corpCityName("Alandi Municipal Council"), "Alandi");
assert.equal(corpCityName("Haveli Taluka"), null);
assert.equal(corpCityName("ठाणे महानगरपालिका"), null);

// Inside a city corporation the corporation decides the city: Ghansoli is Navi Mumbai even though
// the Thane city point is nearer.
const mmr = makeAdmin([
  area("Maharashtra", 4, box(72.6, 18.8, 73.3, 19.4)),
  area("Thane", 5, box(72.9, 19.0, 73.3, 19.4)),
  area("Thane Municipal Corporation", 8, box(72.93, 19.17, 73.0, 19.3)),
  area("Navi Mumbai Municipal Corporation", 8, box(72.97, 18.98, 73.1, 19.17)),
]);
const mmrPlaces = grid([
  { name: "Thane", lat: 19.1970, lng: 72.9700, type: "city", pop: 1841000 },
  { name: "Navi Mumbai", lat: 19.0330, lng: 73.0297, type: "city", pop: 1120000 },
  { name: "Ghansoli", lat: 19.1180, lng: 73.0010, type: "suburb" },
], 0.1);
const mmrGeo = grid([{ name: "Thane", lat: 19.2, lng: 72.97, country: "IN", state: "Maharashtra" }], 0.5);
assert.equal(areaLabel(mmrGeo, mmrPlaces, { lat: 19.12183, lng: 72.99889 }, {}, mmr), "Ghansoli, Navi Mumbai, Maharashtra");
assert.equal(areaLabel(mmrGeo, mmrPlaces, { lat: 19.19, lng: 72.97 }, {}, mmr), "Thane, Maharashtra");

// Rural pump 18 km from a city: "near" the city, not in it.
const cbePlaces = grid([
  { name: "Coimbatore", lat: 11.0168, lng: 76.9558, type: "city", pop: 1050721 },
  { name: "Navakkarai", lat: 10.8680, lng: 76.8800, type: "village" },
], 0.1);
const cbeGeo = grid([{ name: "Coimbatore", lat: 11.0, lng: 76.96, country: "IN", state: "Tamil Nadu" }], 0.5);
assert.equal(areaLabel(cbeGeo, cbePlaces, { lat: 10.86717, lng: 76.88254 }), "Navakkarai, near Coimbatore, Tamil Nadu");

console.log("ok");

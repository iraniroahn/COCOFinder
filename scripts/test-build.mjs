// Quick checks for the pure helpers in build-stations.mjs. Run: node scripts/test-build.mjs
import assert from "node:assert/strict";
import { classifyBrand, isGasOnly, titleCase } from "./build-stations.mjs";

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
console.log("ok");

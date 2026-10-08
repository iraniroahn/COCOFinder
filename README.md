# COCO Finder ⛽

**A website to find XP100 and other ethanol free (non E20) petrol, COCO (Company Owned, Company Operated) fuel stations, and every IndianOil, HP and BPCL petrol pump in India.**

🌐 **Live site: https://iraniroahn.github.io/COCOFinder/**

Since regular petrol in India went E20 (20% ethanol), the only petrol you can still buy without ethanol is the 100 octane premium grade, and only at select pumps. COCO Finder puts those pumps, company operated outlets and every other petrol pump on one map, sorted by distance from you.

## Features

- **Ethanol free (E0) filter**: pumps selling **XP100** (IndianOil), **poWer 100** (HP) or **Speed 100** (BPCL).
- **COCO filter**: Company Owned, Company Operated outlets.
- **Every petrol pump in India**, filterable by brand: IndianOil, HP, BPCL, Jio-bp, Shell, Nayara and others.
- **Near me**: sorts pumps by distance from your location.
- **Search a place**: type a city, area or landmark and press Enter to see the pumps closest to it, or type a pump name to filter.
- **Interactive map**: brand coloured pins, clustering for dense areas, and "E0" pins for ethanol free pumps.
- **One tap directions** through Google Maps.
- **Open 24x7 filter**.
- **Shareable links**: filters are kept in the URL, e.g. `?e0=1&brand=IndianOil`.
- **Mobile friendly**. No sign up, no app install.

## Ethanol free petrol: what counts

| Brand | Ethanol free grade | Not ethanol free |
| --- | --- | --- |
| IndianOil | XP100 | XP95, regular petrol |
| HP | poWer 100 | poWer 95, regular petrol |
| BPCL | Speed 100 | Speed 97, regular petrol |

Availability changes and some pumps run out, so call ahead before a long drive.

## Where the data comes from

| Data | Source |
| --- | --- |
| Pump locations, brands, names, addresses, 24x7 hours | [OpenStreetMap](https://www.openstreetmap.org/) (ODbL), from the [Geofabrik](https://download.geofabrik.de/asia/india.html) India extract |
| XP100 outlets | IndianOil's official list of XP100 outlets at [iocl.com/xp100](https://iocl.com/xp100) |
| poWer 100 and Speed 100 outlets | Outlets named by HPCL and BPCL themselves, listed with sources in [`data/e0-manual.json`](data/e0-manual.json) |
| COCO outlets | Pumps whose official or mapped name says COCO |
| Town and state names | [GeoNames](https://www.geonames.org/) (CC BY 4.0) |

HPCL and BPCL don't publish full lists of their poWer 100 and Speed 100 outlets, and there is no public list of all COCO outlets. Coverage of those two is therefore partial. Additions with a source link are very welcome.

The data is rebuilt every Monday by a GitHub Action ([`update-stations.yml`](.github/workflows/update-stations.yml)), which runs [`scripts/build-stations.mjs`](scripts/build-stations.mjs) and commits the result to [`data/stations.json`](data/stations.json).

## Adding or correcting stations

- **Wrong or missing pump location?** Fix it on [OpenStreetMap](https://www.openstreetmap.org/) (tag it `amenity=fuel` with the right `brand`). It shows up here after the next weekly rebuild.
- **Know a pump that sells poWer 100, Speed 100 or XP100?** Add it to [`data/e0-manual.json`](data/e0-manual.json) with a source link and open a pull request, or [open an issue](https://github.com/iraniroahn/COCOFinder/issues).

## Run it locally

It is a static site with no build step.

```bash
git clone https://github.com/iraniroahn/COCOFinder.git
cd COCOFinder
python3 -m http.server 8000
```

Then open <http://localhost:8000>. A local server is needed because browsers only allow location access on `localhost` or HTTPS.

To rebuild the station data yourself:

```bash
npm install --no-save playwright-core   # uses your installed Chrome
curl -LO https://download.geofabrik.de/asia/india-latest.osm.pbf
osmium tags-filter india-latest.osm.pbf nwr/amenity=fuel -o fuel.osm.pbf
osmium export fuel.osm.pbf -f geojsonseq -o fuel.geojsonseq -a type,id
curl -LO https://download.geonames.org/export/dump/cities5000.zip && unzip cities5000.zip
curl -LO https://download.geonames.org/export/dump/admin1CodesASCII.txt
node scripts/build-stations.mjs
```

## Hosting

The site is deployed to GitHub Pages by [`pages.yml`](.github/workflows/pages.yml) on every push to `main` and after each data rebuild. If you fork the repo, set **Settings → Pages → Source** to **GitHub Actions**.

## Project structure

```
index.html                  Page layout
css/styles.css              Styling
js/app.js                   Search, filters, map, geolocation
data/stations.json          Generated station data (do not edit by hand)
data/e0-manual.json         Sourced poWer 100 / Speed 100 outlets
scripts/build-stations.mjs  Data build script
```

## Built with

[Leaflet](https://leafletjs.com/), [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster), [OpenStreetMap](https://www.openstreetmap.org/) map tiles (no API key needed), [Nominatim](https://nominatim.org/) place search, and plain HTML, CSS and JavaScript.

## Disclaimer

An independent project, not affiliated with or endorsed by Indian Oil Corporation, Hindustan Petroleum, Bharat Petroleum or any other fuel retailer. Always confirm fuel availability with the outlet.

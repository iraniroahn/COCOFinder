# COCO Finder ⛽

**A website to find IndianOil XP100 fuel stations and COCO (Company Owned, Company Operated) petrol pumps near you.**

Looking for 100 octane XP100 for your car or bike, or prefer filling up at a company operated outlet? COCO Finder shows them on a map, sorts them by distance from you and gets you directions in one tap.

## Features

- **XP100 finder**: filter to stations that sell XP100 premium petrol.
- **COCO finder**: filter to Company Owned, Company Operated IndianOil outlets.
- **Interactive map**: colour coded pins (gold for XP100, orange for COCO, split for both) with station details in a popup.
- **Near me**: uses your location to sort stations by distance and highlight the nearest one.
- **Search**: by city, area or station name.
- **Open 24x7 filter** for late night fill ups.
- **One tap directions** through Google Maps.
- **Shareable links**: filters and search are saved in the URL, e.g. `?filter=xp100&q=mumbai`.
- **Mobile friendly**: works on phones, tablets and desktops. No sign up, no app install.

## What is COCO?

COCO stands for **Company Owned, Company Operated**. These outlets are run directly by IndianOil rather than by a dealer, and many drivers prefer them for consistent fuel quality and accurate measurement.

## What is XP100?

XP100 is IndianOil's **100 octane premium petrol**, built for high performance vehicles. It is only available at select outlets, which is exactly what this site helps you find.

## Run it locally

It is a plain static site with no build step.

```bash
git clone https://github.com/iraniroahn/COCOFinder.git
cd COCOFinder
python3 -m http.server 8000
```

Then open <http://localhost:8000>. (A local server is needed because browsers only allow location access on `localhost` or HTTPS.)

## Deploy

Host it anywhere that serves static files. For GitHub Pages: **Settings → Pages → Deploy from a branch**, pick your branch and the `/ (root)` folder.

## Project structure

```
index.html       Page layout
css/styles.css   Styling
js/data.js       Station list (edit this to add or fix stations)
js/app.js        Search, filters, map and geolocation logic
```

## Adding or correcting stations

Station data lives in [`js/data.js`](js/data.js). Each entry looks like:

```js
{ id: "del-cp", name: "IOCL COCO Connaught Place", address: "...", city: "New Delhi",
  lat: 28.6304, lng: 77.2177, coco: true, xp100: true, open24x7: true,
  facilities: ["Petrol", "Diesel", "XP100", "Air"] }
```

Open a pull request with the change, or [open an issue](https://github.com/iraniroahn/COCOFinder/issues) with the station name, address and what it offers.

> **Note:** the current list is sample data for demonstration. Please verify against IndianOil's official locator before relying on it.

## Built with

- [Leaflet](https://leafletjs.com/) for the map
- [OpenStreetMap](https://www.openstreetmap.org/) and [CARTO](https://carto.com/) map tiles
- Vanilla HTML, CSS and JavaScript

## Disclaimer

This is an independent project and is not affiliated with or endorsed by Indian Oil Corporation Ltd. Always confirm fuel availability with the outlet.

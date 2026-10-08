(function () {
  "use strict";

  const INDIA_BOUNDS = [[6.5, 68], [35.5, 97.5]];
  const PAGE_SIZE = 30;

  // Flag bits used in data/stations.json
  const COCO = 1;
  const E0 = 2;
  const H24 = 4;

  const BRAND_STYLE = {
    IndianOil: { color: "#f37021", e0Fuel: "XP100" },
    HP: { color: "#3b82f6", e0Fuel: "poWer 100" },
    BPCL: { color: "#facc15", e0Fuel: "Speed 100" },
    "Jio-bp": { color: "#22c55e" },
    Shell: { color: "#ef4444" },
    Nayara: { color: "#a855f7" },
    Other: { color: "#9ca3af" },
  };

  const state = {
    query: "",
    brand: "all",
    e0: false,
    coco: false,
    open24: false,
    anchor: null, // { lat, lng, label, kind: "user" | "place" | "map" }
    selectedId: null,
    shown: PAGE_SIZE,
  };

  const els = {
    form: document.getElementById("searchForm"),
    search: document.getElementById("search"),
    clearSearch: document.getElementById("clearSearch"),
    brandChips: document.querySelectorAll("[data-brand]"),
    e0: document.getElementById("fE0"),
    coco: document.getElementById("fCoco"),
    open24: document.getElementById("f24"),
    list: document.getElementById("list"),
    status: document.getElementById("status"),
    anchor: document.getElementById("anchor"),
    locateBtn: document.getElementById("locateBtn"),
    updated: document.getElementById("updated"),
  };

  let stations = [];

  // ---------- Helpers ----------

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // Great circle distance in metres.
  function distance(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function formatDistance(m) {
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
  }

  function directionsUrl(s) {
    return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
  }

  function e0Fuel(s) {
    return (BRAND_STYLE[s.brand] && BRAND_STYLE[s.brand].e0Fuel) || "Ethanol free petrol";
  }

  function badges(s) {
    let html = `<span class="badge badge-brand" style="--brand:${BRAND_STYLE[s.brand].color}">${escapeHtml(s.brand)}</span>`;
    if (s.e0) html += `<span class="badge badge-e0">E0 · ${escapeHtml(e0Fuel(s))}</span>`;
    if (s.coco) html += '<span class="badge badge-coco">COCO</span>';
    if (s.open24) html += '<span class="badge">24x7</span>';
    return html;
  }

  function matches(s, { ignoreBrand = false } = {}) {
    if (!ignoreBrand && state.brand !== "all" && s.brand !== state.brand) return false;
    if (state.e0 && !s.e0) return false;
    if (state.coco && !s.coco) return false;
    if (state.open24 && !s.open24) return false;
    if (state.query && !s.search.includes(state.query.toLowerCase())) return false;
    return true;
  }

  // ---------- Map ----------

  const map = L.map("map", { zoomControl: true }).fitBounds(INDIA_BOUNDS);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  const cluster = L.markerClusterGroup({
    chunkedLoading: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 14,
    maxClusterRadius: 50,
    iconCreateFunction(c) {
      const n = c.getChildCount();
      const size = n < 50 ? 36 : n < 500 ? 44 : 52;
      return L.divIcon({
        html: `<div class="cluster"><span>${n >= 1000 ? Math.round(n / 100) / 10 + "k" : n}</span></div>`,
        className: "",
        iconSize: [size, size],
      });
    },
  }).addTo(map);

  let userMarker = null;
  let placeMarker = null;

  function markerIcon(s, selected) {
    const color = BRAND_STYLE[s.brand].color;
    const special = s.e0 || s.coco;
    const label = s.e0 ? "E0" : "C";
    return L.divIcon({
      className: "",
      html: special
        ? `<div class="pin${selected ? " pin-selected" : ""}${s.e0 ? " pin-e0" : ""}" style="--brand:${color}"><span>${label}</span></div>`
        : `<div class="dot${selected ? " dot-selected" : ""}" style="--brand:${color}"></div>`,
      iconSize: special ? [32, 32] : [14, 14],
      iconAnchor: special ? [16, 32] : [7, 7],
      popupAnchor: special ? [0, -28] : [0, -6],
    });
  }

  function popupHtml(s) {
    const dist = state.anchor ? `<div class="popup-dist">${formatDistance(distance(state.anchor, s))} from ${escapeHtml(state.anchor.label)}</div>` : "";
    const where = [s.address, s.area].filter(Boolean).join(", ");
    return `
      <div class="popup">
        <strong>${escapeHtml(s.name)}</strong>
        ${where ? `<div class="popup-addr">${escapeHtml(where)}</div>` : ""}
        <div class="badges">${badges(s)}</div>
        ${dist}
        ${s.e0 ? `<div class="popup-note">Listed as selling ${escapeHtml(e0Fuel(s))}, petrol with no ethanol blend. Call ahead to confirm stock.</div>` : ""}
        <a class="btn btn-primary btn-sm" href="${directionsUrl(s)}" target="_blank" rel="noopener">Get directions</a>
      </div>`;
  }

  function ensureMarker(s) {
    if (!s.marker) {
      s.marker = L.marker([s.lat, s.lng], {
        icon: markerIcon(s, false),
        title: s.name,
        zIndexOffset: s.e0 ? 1000 : s.coco ? 500 : 0,
      });
      s.marker.bindPopup(() => popupHtml(s), { maxWidth: 280 });
      s.marker.on("click", () => select(s.id, { fly: false }));
    }
    return s.marker;
  }

  let lastMarkerKey = "";
  function renderMarkers(visible) {
    // Only rebuild the cluster layer when the filtered set actually changes.
    const key = `${state.brand}|${state.e0}|${state.coco}|${state.open24}|${state.query}`;
    if (key === lastMarkerKey) return;
    lastMarkerKey = key;
    cluster.clearLayers();
    cluster.addLayers(visible.map(ensureMarker));
  }

  function refreshMarkerIcon(id, selected) {
    const s = stations[+id];
    if (s && s.marker) s.marker.setIcon(markerIcon(s, selected));
  }

  // ---------- List ----------

  function renderList(sorted) {
    const items = sorted.slice(0, state.shown);
    els.list.innerHTML = items.map((s) => {
      const where = s.address || s.area;
      return `
      <li>
        <button class="card glass${s.id === state.selectedId ? " selected" : ""}" data-id="${s.id}" type="button">
          <span class="brand-bar" style="--brand:${BRAND_STYLE[s.brand].color}"></span>
          <div class="card-main">
            <div class="card-title">${escapeHtml(s.name)}</div>
            ${where ? `<div class="card-addr">${escapeHtml(where)}</div>` : ""}
            <div class="badges">${badges(s)}</div>
          </div>
          <div class="card-side">
            ${s.dist != null ? `<span class="dist">${formatDistance(s.dist)}</span>` : ""}
            <a class="dir" href="${directionsUrl(s)}" target="_blank" rel="noopener" aria-label="Directions to ${escapeHtml(s.name)}" title="Directions">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21.71 11.29 12.71 2.29a1 1 0 0 0-1.42 0l-9 9a1 1 0 0 0 0 1.42l9 9a1 1 0 0 0 1.42 0l9-9a1 1 0 0 0 0-1.42ZM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5Z"/></svg>
            </a>
          </div>
        </button>
      </li>`;
    }).join("");

    if (!sorted.length) {
      els.list.innerHTML = `<li class="empty glass">No pumps match these filters. Try another brand, turn off a filter, or search a different place.</li>`;
    } else if (sorted.length > items.length) {
      els.list.insertAdjacentHTML("beforeend",
        `<li><button id="moreBtn" class="btn more" type="button">Show more (${(sorted.length - items.length).toLocaleString("en-IN")} more)</button></li>`);
    }
  }

  function renderCounts() {
    els.brandChips.forEach((chip) => {
      const b = chip.dataset.brand;
      let n = 0;
      for (const s of stations) if ((b === "all" || s.brand === b) && matches(s, { ignoreBrand: true })) n++;
      chip.querySelector(".count").textContent = n.toLocaleString("en-IN");
      chip.setAttribute("aria-pressed", String(b === state.brand));
    });
    [["e0", els.e0], ["coco", els.coco], ["open24", els.open24]].forEach(([k, el]) =>
      el.setAttribute("aria-pressed", String(state[k])));
  }

  function renderStatus(sorted) {
    const what = [
      state.e0 && "ethanol free",
      state.coco && "COCO",
      state.open24 && "24x7",
      state.brand !== "all" && state.brand,
    ].filter(Boolean).join(" ");
    const n = sorted.length.toLocaleString("en-IN");
    els.status.textContent = `${n} ${what ? what + " " : ""}pump${sorted.length === 1 ? "" : "s"}`;

    if (state.anchor) {
      const icon = state.anchor.kind === "user" ? "📍" : state.anchor.kind === "place" ? "🔎" : "🗺️";
      els.anchor.innerHTML = `${icon} Sorted by distance from <strong>${escapeHtml(state.anchor.label)}</strong>` +
        (state.anchor.kind !== "map" ? ' <button type="button" class="link" id="clearAnchor">Clear</button>' : "");
    } else {
      els.anchor.textContent = "Tap Near me or search a city or area to see the closest pumps.";
    }
  }

  // ---------- State changes ----------

  function syncUrl() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.brand !== "all") params.set("brand", state.brand);
    if (state.e0) params.set("e0", "1");
    if (state.coco) params.set("coco", "1");
    if (state.open24) params.set("open", "24x7");
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  function visibleSorted() {
    const visible = stations.filter((s) => matches(s));
    if (state.anchor) {
      for (const s of visible) s.dist = distance(state.anchor, s);
      visible.sort((a, b) => a.dist - b.dist);
    } else {
      // No reference point yet: show ethanol free and COCO pumps first.
      for (const s of visible) s.dist = null;
      visible.sort((a, b) => (b.e0 - a.e0) || (b.coco - a.coco));
    }
    return visible;
  }

  function render({ markers = true } = {}) {
    const sorted = visibleSorted();
    renderCounts();
    renderStatus(sorted);
    renderList(sorted);
    if (markers) renderMarkers(sorted);
    syncUrl();
    return sorted;
  }

  // Programmatic map moves should not reset the list to the map centre.
  let programmaticMove = false;
  function moveMap(fn) {
    programmaticMove = true;
    fn();
  }

  function filtersChanged() {
    state.shown = PAGE_SIZE;
    const sorted = render();
    // When the filters leave only a handful of pumps and no place is set, zoom to show them all.
    if (!state.anchor || state.anchor.kind === "map") {
      if (sorted.length && sorted.length <= 300 && (state.e0 || state.coco || state.query)) {
        moveMap(() => map.flyToBounds(sorted.map((s) => [s.lat, s.lng]), { padding: [40, 40], maxZoom: 13, duration: 0.8 }));
      }
    }
  }

  function select(id, { fly = true } = {}) {
    if (state.selectedId) refreshMarkerIcon(state.selectedId, false);
    state.selectedId = id;
    refreshMarkerIcon(id, true);
    const s = stations[+id];
    els.list.querySelectorAll(".card.selected").forEach((c) => c.classList.remove("selected"));
    const card = els.list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (card) card.classList.add("selected");
    if (!s) return;

    if (fly) {
      moveMap(() => cluster.zoomToShowLayer(ensureMarker(s), () => s.marker.openPopup()));
      // On small screens the map sits above the list, so bring it into view.
      if (window.matchMedia("(max-width: 900px)").matches) {
        document.querySelector(".map-wrap").scrollIntoView({ block: "start", behavior: "smooth" });
      }
    } else if (card) {
      card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function setAnchor(anchor) {
    state.anchor = anchor;
    state.shown = PAGE_SIZE;
    const sorted = render({ markers: false });
    const near = sorted.slice(0, 5).map((s) => [s.lat, s.lng]);
    near.push([anchor.lat, anchor.lng]);
    moveMap(() => map.flyToBounds(near, { padding: [50, 50], maxZoom: 15, duration: 0.9 }));
  }

  // Without a location or searched place, the list follows the map centre once zoomed in.
  map.on("moveend", () => {
    if (programmaticMove) { programmaticMove = false; return; }
    if (state.anchor && state.anchor.kind !== "map") return;
    if (map.getZoom() < 10) {
      if (state.anchor) { state.anchor = null; render({ markers: false }); }
      return;
    }
    const c = map.getCenter();
    state.anchor = { lat: c.lat, lng: c.lng, label: "the map centre", kind: "map" };
    state.shown = PAGE_SIZE;
    render({ markers: false });
  });

  function setLocateLabel(text, busy) {
    els.locateBtn.disabled = busy;
    els.locateBtn.querySelector("span").textContent = text;
  }

  function locate() {
    if (!navigator.geolocation) {
      els.status.textContent = "Location is not supported by this browser. Search a place instead.";
      return;
    }
    setLocateLabel("Locating...", true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocateLabel("Near me", false);
        const anchor = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "you", kind: "user" };
        if (userMarker) userMarker.remove();
        userMarker = L.circleMarker([anchor.lat, anchor.lng], {
          radius: 8, color: "#fff", weight: 3, fillColor: "#3b82f6", fillOpacity: 1,
        }).addTo(map).bindTooltip("You are here");
        setAnchor(anchor);
      },
      (err) => {
        setLocateLabel("Near me", false);
        els.status.textContent = err.code === err.PERMISSION_DENIED
          ? "Location permission denied. Search a city or area instead."
          : "Could not get your location. Try again or search a place.";
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  // Look up a typed place (city, area, landmark) with OpenStreetMap Nominatim.
  // Only runs when the person presses Enter, as the Nominatim usage policy asks.
  async function searchPlace(text) {
    els.status.textContent = `Looking up "${text}"...`;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const [hit] = await res.json();
      if (!hit) return false;
      const label = hit.display_name.split(",").slice(0, 2).join(",").trim();
      const anchor = { lat: +hit.lat, lng: +hit.lon, label, kind: "place" };
      if (placeMarker) placeMarker.remove();
      placeMarker = L.circleMarker([anchor.lat, anchor.lng], {
        radius: 7, color: "#fff", weight: 2, fillColor: "#a855f7", fillOpacity: 1,
      }).addTo(map).bindTooltip(label);
      state.query = "";
      renderMarkers(stations.filter((s) => matches(s)));
      setAnchor(anchor);
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearAnchor() {
    if (placeMarker) { placeMarker.remove(); placeMarker = null; }
    if (userMarker) { userMarker.remove(); userMarker = null; }
    state.anchor = null;
    map.fire("moveend");
    render({ markers: false });
  }

  // ---------- Events ----------

  let searchTimer;
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    els.clearSearch.hidden = !els.search.value;
    searchTimer = setTimeout(() => {
      state.query = els.search.value.trim();
      if (state.anchor && state.anchor.kind === "place") {
        if (placeMarker) { placeMarker.remove(); placeMarker = null; }
        state.anchor = null;
      }
      filtersChanged();
    }, 250);
  });

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    const text = els.search.value.trim();
    if (!text) return;
    els.search.blur();
    if (!(await searchPlace(text))) {
      state.query = text;
      filtersChanged();
    }
  });

  els.clearSearch.addEventListener("click", () => {
    els.search.value = "";
    els.clearSearch.hidden = true;
    state.query = "";
    if (state.anchor && state.anchor.kind === "place") clearAnchor();
    filtersChanged();
    els.search.focus();
  });

  els.brandChips.forEach((chip) =>
    chip.addEventListener("click", () => {
      state.brand = chip.dataset.brand;
      filtersChanged();
    })
  );

  [["e0", els.e0], ["coco", els.coco], ["open24", els.open24]].forEach(([k, el]) =>
    el.addEventListener("click", () => {
      state[k] = !state[k];
      filtersChanged();
    })
  );

  els.list.addEventListener("click", (e) => {
    if (e.target.closest("a")) return; // let the directions link work normally
    if (e.target.closest("#moreBtn")) {
      state.shown += PAGE_SIZE;
      render({ markers: false });
      return;
    }
    const card = e.target.closest(".card");
    if (card) select(card.dataset.id);
  });

  els.anchor.addEventListener("click", (e) => {
    if (e.target.id === "clearAnchor") {
      els.search.value = "";
      els.clearSearch.hidden = true;
      clearAnchor();
    }
  });

  els.locateBtn.addEventListener("click", locate);

  // ---------- Init ----------

  function decode(data) {
    return data.stations.map((r, i) => {
      const [lat, lng, b, name, flags, area, address] = r;
      const brand = BRAND_STYLE[data.brands[b]] ? data.brands[b] : "Other";
      const s = {
        id: String(i),
        lat, lng, brand,
        name: name || `${brand} petrol pump`,
        area: area || "",
        address: address || "",
        coco: Boolean(flags & COCO),
        e0: Boolean(flags & E0),
        open24: Boolean(flags & H24),
      };
      s.search = [s.name, s.area, s.address, s.brand, s.e0 ? `${e0Fuel(s)} e0 ethanol free` : "", s.coco ? "coco" : ""]
        .join(" ").toLowerCase();
      return s;
    });
  }

  const params = new URLSearchParams(location.search);
  state.query = params.get("q") || "";
  state.brand = BRAND_STYLE[params.get("brand")] ? params.get("brand") : "all";
  state.e0 = params.get("e0") === "1";
  state.coco = params.get("coco") === "1";
  state.open24 = params.get("open") === "24x7";
  els.search.value = state.query;
  els.clearSearch.hidden = !state.query;

  els.status.textContent = "Loading pumps...";
  fetch("data/stations.json")
    .then((r) => r.json())
    .then((data) => {
      stations = decode(data);
      if (data.generated) els.updated.textContent = `Station data updated ${data.generated}.`;
      filtersChanged();
    })
    .catch(() => {
      els.status.textContent = "Couldn't load station data. Please refresh the page.";
    });
})();

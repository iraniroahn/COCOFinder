(function () {
  "use strict";

  const INDIA_CENTER = [22.5, 79];
  const stations = window.STATIONS || [];

  const state = {
    query: "",
    filter: "all",
    only24: false,
    userLocation: null,
    selectedId: null,
  };

  const els = {
    search: document.getElementById("search"),
    chips: document.querySelectorAll(".chip"),
    only24: document.getElementById("only24"),
    list: document.getElementById("list"),
    status: document.getElementById("status"),
    locateBtn: document.getElementById("locateBtn"),
  };

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

  function matchesFilter(s, filter) {
    if (filter === "coco") return s.coco;
    if (filter === "xp100") return s.xp100;
    return true;
  }

  function visibleStations() {
    const q = state.query.trim().toLowerCase();
    let result = stations.filter((s) =>
      matchesFilter(s, state.filter) &&
      (!state.only24 || s.open24x7) &&
      (!q || [s.name, s.city, s.address].some((f) => f.toLowerCase().includes(q)))
    );
    if (state.userLocation) {
      result = result
        .map((s) => ({ ...s, distance: distance(state.userLocation, s) }))
        .sort((a, b) => a.distance - b.distance);
    }
    return result;
  }

  function badges(s) {
    let html = "";
    if (s.xp100) html += '<span class="badge badge-xp">XP100</span>';
    if (s.coco) html += '<span class="badge badge-coco">COCO</span>';
    if (s.open24x7) html += '<span class="badge">24x7</span>';
    return html;
  }

  // ---------- Map ----------

  const map = L.map("map", { zoomControl: true, scrollWheelZoom: true }).setView(INDIA_CENTER, 5);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  const markers = new Map();
  let userMarker = null;

  function markerIcon(s, selected) {
    const kind = s.xp100 && s.coco ? "both" : s.xp100 ? "xp" : "coco";
    return L.divIcon({
      className: "",
      html: `<div class="pin pin-${kind}${selected ? " pin-selected" : ""}"><span>⛽</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -30],
    });
  }

  function popupHtml(s) {
    const dist = state.userLocation ? `<div class="popup-dist">${formatDistance(distance(state.userLocation, s))} away</div>` : "";
    return `
      <div class="popup">
        <strong>${escapeHtml(s.name)}</strong>
        <div class="popup-addr">${escapeHtml(s.address)}</div>
        <div class="badges">${badges(s)}</div>
        ${dist}
        <div class="facilities">${s.facilities.map((f) => `<span>${escapeHtml(f)}</span>`).join("")}</div>
        <a class="btn btn-primary btn-sm" href="${directionsUrl(s)}" target="_blank" rel="noopener">Get directions</a>
      </div>`;
  }

  stations.forEach((s) => {
    const m = L.marker([s.lat, s.lng], { icon: markerIcon(s, false), title: s.name, riseOnHover: true });
    m.bindPopup(() => popupHtml(s), { maxWidth: 260 });
    m.on("click", () => select(s.id, { fly: false }));
    markers.set(s.id, m);
  });

  function renderMarkers(visible) {
    const ids = new Set(visible.map((s) => s.id));
    stations.forEach((s) => {
      const m = markers.get(s.id);
      if (ids.has(s.id)) {
        if (!map.hasLayer(m)) m.addTo(map);
        m.setIcon(markerIcon(s, s.id === state.selectedId));
      } else if (map.hasLayer(m)) {
        map.removeLayer(m);
      }
    });
  }

  function fitTo(visible) {
    const points = visible.map((s) => [s.lat, s.lng]);
    if (state.userLocation) points.push([state.userLocation.lat, state.userLocation.lng]);
    if (points.length === 1) map.flyTo(points[0], 13);
    else if (points.length > 1) map.flyToBounds(points, { padding: [40, 40], maxZoom: 13 });
  }

  // ---------- List ----------

  function renderList(visible) {
    const nearestId = state.userLocation && visible.length ? visible[0].id : null;

    els.list.innerHTML = visible.map((s) => `
      <li>
        <button class="card glass${s.id === state.selectedId ? " selected" : ""}" data-id="${s.id}" type="button">
          <div class="card-main">
            <div class="card-title">
              ${escapeHtml(s.name)}
              ${s.id === nearestId ? '<span class="nearest">Nearest</span>' : ""}
            </div>
            <div class="card-addr">${escapeHtml(s.address)}</div>
            <div class="badges">${badges(s)}</div>
          </div>
          <div class="card-side">
            ${s.distance != null ? `<span class="dist">${formatDistance(s.distance)}</span>` : ""}
            <a class="dir" href="${directionsUrl(s)}" target="_blank" rel="noopener" aria-label="Directions to ${escapeHtml(s.name)}" title="Directions">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21.71 11.29 12.71 2.29a1 1 0 0 0-1.42 0l-9 9a1 1 0 0 0 0 1.42l9 9a1 1 0 0 0 1.42 0l9-9a1 1 0 0 0 0-1.42ZM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5Z"/></svg>
            </a>
          </div>
        </button>
      </li>`).join("");

    if (!visible.length) {
      els.list.innerHTML = `<li class="empty glass">No stations match. Try another city or clear the filters.</li>`;
    }
  }

  function renderCounts() {
    els.chips.forEach((chip) => {
      const f = chip.dataset.filter;
      chip.querySelector(".count").textContent = stations.filter((s) => matchesFilter(s, f) && (!state.only24 || s.open24x7)).length;
      chip.setAttribute("aria-pressed", String(f === state.filter));
    });
  }

  function renderStatus(visible) {
    const label = { all: "stations", coco: "COCO stations", xp100: "XP100 stations" }[state.filter];
    let text = `${visible.length} ${label}`;
    if (state.userLocation) text += " sorted by distance";
    els.status.textContent = text;
  }

  // ---------- State changes ----------

  function syncUrl() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.filter !== "all") params.set("filter", state.filter);
    if (state.only24) params.set("open", "24x7");
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  function render({ fit = false } = {}) {
    const visible = visibleStations();
    renderCounts();
    renderStatus(visible);
    renderList(visible);
    renderMarkers(visible);
    if (fit) fitTo(visible);
    syncUrl();
  }

  function select(id, { fly = true } = {}) {
    state.selectedId = id;
    const s = stations.find((x) => x.id === id);
    render();
    if (!s) return;
    const m = markers.get(id);
    if (fly) map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
    if (m && map.hasLayer(m)) m.openPopup();
    // On small screens the map sits above the list, so bring it into view.
    if (fly && window.matchMedia("(max-width: 900px)").matches) {
      document.querySelector(".map-wrap").scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      const card = els.list.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      els.status.textContent = "Location is not supported by this browser.";
      return;
    }
    els.locateBtn.disabled = true;
    els.locateBtn.querySelector("span").textContent = "Locating...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (userMarker) userMarker.remove();
        userMarker = L.circleMarker([state.userLocation.lat, state.userLocation.lng], {
          radius: 8, color: "#fff", weight: 3, fillColor: "#3b82f6", fillOpacity: 1,
        }).addTo(map).bindTooltip("You are here");
        els.locateBtn.disabled = false;
        els.locateBtn.querySelector("span").textContent = "Near me";
        const visible = visibleStations();
        state.selectedId = visible.length ? visible[0].id : null;
        render();
        if (visible.length) {
          map.flyToBounds([[state.userLocation.lat, state.userLocation.lng], [visible[0].lat, visible[0].lng]], { padding: [60, 60], maxZoom: 14 });
        }
      },
      (err) => {
        els.locateBtn.disabled = false;
        els.locateBtn.querySelector("span").textContent = "Near me";
        els.status.textContent = err.code === err.PERMISSION_DENIED
          ? "Location permission denied. Search by city instead."
          : "Could not get your location. Try again or search by city.";
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  // ---------- Events ----------

  let searchTimer;
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.search.value;
      render({ fit: true });
    }, 200);
  });

  els.chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      state.filter = chip.dataset.filter;
      render({ fit: true });
    })
  );

  els.only24.addEventListener("change", () => {
    state.only24 = els.only24.checked;
    render({ fit: true });
  });

  els.list.addEventListener("click", (e) => {
    if (e.target.closest("a")) return; // let the directions link work normally
    const card = e.target.closest(".card");
    if (card) select(card.dataset.id);
  });

  els.locateBtn.addEventListener("click", locate);

  // ---------- Init ----------

  const params = new URLSearchParams(location.search);
  state.query = params.get("q") || "";
  state.filter = ["all", "coco", "xp100"].includes(params.get("filter")) ? params.get("filter") : "all";
  state.only24 = params.get("open") === "24x7";
  els.search.value = state.query;
  els.only24.checked = state.only24;

  const initial = visibleStations();
  if (initial.length) map.fitBounds(initial.map((s) => [s.lat, s.lng]), { padding: [30, 30], maxZoom: 13 });
  render();
})();

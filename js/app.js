(() => {
  "use strict";

  const T = window.TRIP;
  const STORE_KEY = "innsbruck-trip-v1";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------------- State ----------------
  const DATA_VERSION = 2; // bump when the built-in plan changes
  function seedState() {
    return {
      version: DATA_VERSION,
      startDate: T.startDate || "",
      checks: {},
      stageNotes: {},
      foods: {},
      saves: [],
      openStages: ["prep"],
      days: T.itinerary.map((d) => ({
        id: uid(),
        title: d.title,
        items: d.items.map((it) => ({ id: uid(), time: it.time, title: it.title, place: it.place || "", note: it.note || "" }))
      }))
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const fresh = seedState();
        if ((saved.version || 1) < DATA_VERSION) {
          // Built-in plan changed (real flights & hotel): take the new days, dates and checklists,
          // keep the user's own notes, food ticks and Instagram saves.
          return Object.assign(fresh, { stageNotes: saved.stageNotes || {}, foods: saved.foods || {}, saves: saved.saves || [] });
        }
        return Object.assign(fresh, saved);
      }
    } catch (e) { /* storage unavailable or corrupt */ }
    return seedState();
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // Two-tap confirm (browser confirm() dialogs are blocked in some embeds)
  function confirmTap(btn, prompt) {
    if (btn.dataset.armed === "1") { delete btn.dataset.armed; return true; }
    btn.dataset.armed = "1";
    const old = btn.innerHTML;
    btn.innerHTML = esc(prompt);
    btn.classList.add("armed");
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.innerHTML = old; btn.classList.remove("armed"); } }, 3000);
    return false;
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  // ---------------- Places ----------------
  const basePlaces = Object.fromEntries(T.places.map((p) => [p.id, p]));
  function allPlaces() {
    const saved = state.saves
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({
        id: "save-" + s.id, cat: "saved", name: s.title, lat: s.lat, lng: s.lng,
        desc: "Saved from Instagram" + (s.catHint && s.catHint !== "saved" ? " · " + T.categories[s.catHint].label : ""),
        url: s.url, catHint: s.catHint
      }));
    return [...T.places, ...saved];
  }
  const placeById = (id) => basePlaces[id] || allPlaces().find((p) => p.id === id);
  const byTransit = (p) => p.cat === "transport";
  const directionsUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=${byTransit(p) ? "transit" : "walking"}`;
  const appleMapsUrl = (p) => `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}&dirflg=${byTransit(p) ? "r" : "w"}`;

  // ---------------- Tabs ----------------
  const tabs = $$(".tabs button");
  function showTab(name) {
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $$(".panel").forEach((p) => {
      const show = p.id === "tab-" + name;
      // The map panel stays laid out off-screen so it can load in the background
      if (p.id === "tab-map") { p.hidden = false; p.classList.toggle("offscreen", !show); p.setAttribute("aria-hidden", String(!show)); }
      else p.hidden = !show;
    });
    if (name === "map") {
      initMap();
      map.invalidateSize();
    }
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  }
  tabs.forEach((b) => b.addEventListener("click", () => { if (b.dataset.tab !== "map") endPinMode(); showTab(b.dataset.tab); }));

  function syncHeaderHeight() {
    document.documentElement.style.setProperty("--header-h", $(".top").offsetHeight + "px");
  }
  window.addEventListener("resize", syncHeaderHeight);

  // ---------------- Timeline ----------------
  function stageItems(stage) {
    return [...stage.need.map((t, i) => ["need", i, t]), ...stage.todo.map((t, i) => ["todo", i, t])];
  }
  const checkKey = (stageId, kind, i) => `${stageId}:${kind}:${i}`;

  function renderTimeline() {
    const ol = $("#timelineList");
    let total = 0, doneTotal = 0;
    ol.innerHTML = T.stages.map((s) => {
      const items = stageItems(s);
      const done = items.filter(([k, i]) => state.checks[checkKey(s.id, k, i)]).length;
      total += items.length; doneTotal += done;
      const list = (kind, arr) => arr.map((t, i) => {
        const key = checkKey(s.id, kind, i);
        return `<li><label><input type="checkbox" data-check="${key}" ${state.checks[key] ? "checked" : ""}><span>${esc(t)}</span></label></li>`;
      }).join("");
      const open = state.openStages.includes(s.id);
      return `
        <li class="stage ${open ? "open" : ""} ${done === items.length ? "done" : ""}" data-stage="${s.id}">
          <div class="stage-dot" aria-hidden="true">${s.icon}</div>
          <div class="stage-card">
            <button class="stage-head" aria-expanded="${open}">
              <div class="grow"><h3>${esc(s.title)}</h3><div class="sub">${esc(s.sub)}</div></div>
              <span class="stage-count">${done}/${items.length}</span>
              <span class="chev">›</span>
            </button>
            <div class="stage-body">
              ${s.booking?.length ? `<dl class="booking">${s.booking.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
              <div class="stage-cols">
                <div><h4>What you need</h4><ul class="checklist">${list("need", s.need)}</ul></div>
                <div><h4>What to do</h4><ul class="checklist">${list("todo", s.todo)}</ul></div>
              </div>
              ${s.tips?.length ? `<div class="tips">${s.tips.map((t) => `<p>💡 ${esc(t)}</p>`).join("")}</div>` : ""}
              <div class="stage-notes">
                <h4>Your notes (booking refs, seats, gates…)</h4>
                <textarea data-note="${s.id}" placeholder="e.g. booking ref, seat numbers, gate">${esc(state.stageNotes[s.id] || "")}</textarea>
              </div>
              ${s.place ? `<div class="stage-actions"><button class="btn ghost sm" data-goto="${s.place}">Show on map →</button></div>` : ""}
            </div>
          </div>
        </li>`;
    }).join("");
    $("#overallProgress").textContent = `${doneTotal} of ${total} ticked off`;
  }

  $("#timelineList").addEventListener("click", (e) => {
    const head = e.target.closest(".stage-head");
    if (head) {
      const id = head.closest(".stage").dataset.stage;
      state.openStages = state.openStages.includes(id) ? state.openStages.filter((x) => x !== id) : [...state.openStages, id];
      save(); renderTimeline();
      return;
    }
    const go = e.target.closest("[data-goto]");
    if (go) goToPlace(go.dataset.goto);
  });
  $("#timelineList").addEventListener("change", (e) => {
    const key = e.target.dataset.check;
    if (!key) return;
    if (e.target.checked) state.checks[key] = true; else delete state.checks[key];
    save(); renderTimeline();
  });
  $("#timelineList").addEventListener("input", (e) => {
    const id = e.target.dataset.note;
    if (!id) return;
    state.stageNotes[id] = e.target.value;
    save();
  });

  const startInput = $("#startDate");
  startInput.value = state.startDate || "";
  startInput.addEventListener("change", () => { state.startDate = startInput.value; save(); renderDays(); });

  // ---------------- Map ----------------
  let map = null, layers = {}, markers = {}, routeLayer = null, pinTarget = null;
  const activeCats = new Set(Object.keys(T.categories));
  const INNSBRUCK_VIEW = [[47.248, 11.375], [47.31, 11.44]];

  function pinIcon(cat) {
    const c = T.categories[cat];
    return L.divIcon({
      className: "",
      html: `<div class="pin ${cat}" style="background:${c.color}"><span>${c.icon}</span></div>`,
      iconSize: cat === "market" ? [36, 36] : [30, 30],
      iconAnchor: cat === "market" ? [18, 36] : [15, 30],
      popupAnchor: [0, -32],
      tooltipAnchor: [12, -18]
    });
  }

  function popupHtml(p) {
    const c = T.categories[p.cat];
    const how = p.howto ? `<p class="how"><strong>How to get there</strong>${esc(p.howto)}</p>` : "";
    const ig = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Open on Instagram ↗</a>` : "";
    return `<div class="pop">
      <span class="tag" style="color:${c.color}">${c.icon} ${esc(c.label)}</span>
      <h3>${esc(p.name)}</h3>
      ${p.desc ? `<p>${esc(p.desc)}</p>` : ""}
      ${how}
      <div class="links">
        <span class="links-label">Directions</span>
        <a class="map-btn" href="${directionsUrl(p)}" target="_blank" rel="noopener">Google Maps</a>
        <a class="map-btn" href="${appleMapsUrl(p)}" target="_blank" rel="noopener">Apple Maps</a>
        <a class="map-btn ghost" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}" target="_blank" rel="noopener">Street View</a>
        ${ig}
      </div>
    </div>`;
  }

  function buildMarkers() {
    Object.values(layers).forEach((l) => l.clearLayers());
    markers = {};
    allPlaces().forEach((p) => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(p.cat), riseOnHover: true, zIndexOffset: p.cat === "market" ? 500 : 0 })
        .bindPopup(popupHtml(p), { maxWidth: 300, minWidth: 220, autoPanPadding: [20, 20] })
        .bindTooltip(p.name, { direction: "top", className: "hover-tip" });
      layers[p.cat].addLayer(m);
      markers[p.id] = m;
    });
  }

  function buildRoute() {
    const pt = (id) => [basePlaces[id].lat, basePlaces[id].lng];
    routeLayer = L.layerGroup();
    T.route.flights.forEach(([a, b]) => {
      L.polyline([pt(a), pt(b)], { color: "#2e5c8a", weight: 2.5, dashArray: "6 8", opacity: .8 })
        .bindTooltip("Flight", { sticky: true }).addTo(routeLayer);
    });
    L.polyline(T.route.ground.map(pt), { color: "#b8322a", weight: 3.5, opacity: .85 })
      .bindTooltip("S-Bahn & Mittenwald line", { sticky: true }).addTo(routeLayer);
  }

  function renderFilters() {
    $("#mapFilters").innerHTML = Object.entries(T.categories).map(([k, c]) =>
      `<button class="chip" data-cat="${k}" aria-pressed="${activeCats.has(k)}"><span class="swatch" style="background:${c.color}"></span>${esc(c.label)}</button>`
    ).join("");
  }
  $("#mapFilters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const k = chip.dataset.cat;
    if (activeCats.has(k)) { activeCats.delete(k); map.removeLayer(layers[k]); }
    else { activeCats.add(k); map.addLayer(layers[k]); }
    renderFilters();
  });

  function initMap() {
    if (map) return;
    map = L.map("leafletMap", { zoomControl: true, tap: true }).fitBounds(INNSBRUCK_VIEW);
    if (window.TRIP_TILES === false) {
      // No street tiles available here: plain background + a note
      $("#leafletMap").classList.add("no-tiles");
      const note = L.control({ position: "bottomleft" });
      note.onAdd = () => Object.assign(document.createElement("div"), { className: "map-note", textContent: "Street map not available in this version. Tap a pin, then Directions to open Google Maps." });
      note.addTo(map);
    } else {
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        crossOrigin: true,     // lets the service worker cache tiles properly
        keepBuffer: 6,         // keep more tiles around the view so panning is instant
        updateWhenIdle: false,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
    }
    Object.keys(T.categories).forEach((k) => { layers[k] = L.layerGroup().addTo(map); });
    buildRoute();
    routeLayer.addTo(map);
    buildMarkers();
    renderFilters();

    map.on("click", (e) => {
      if (!pinTarget) return;
      const s = state.saves.find((x) => x.id === pinTarget);
      if (s) {
        s.lat = +e.latlng.lat.toFixed(5); s.lng = +e.latlng.lng.toFixed(5);
        save(); buildMarkers(); renderSaves(); renderDays();
        toast("Pinned " + s.title);
        setTimeout(() => markers["save-" + s.id]?.openPopup(), 50);
      }
      endPinMode();
    });
  }

  function goToPlace(id) {
    endPinMode();
    const p = placeById(id);
    if (!p) { toast("That place isn't on the map yet"); return; }
    showTab("map");
    if (!activeCats.has(p.cat)) { activeCats.add(p.cat); map.addLayer(layers[p.cat]); renderFilters(); }
    const inCity = p.lat > 47.24 && p.lat < 47.315 && p.lng > 11.36 && p.lng < 11.45;
    const zoom = p.cat === "transport" && !p.id.startsWith("t-ibk") ? 11 : inCity ? 16 : 14;
    map.setView([p.lat, p.lng], zoom, { animate: false });
    markers[id]?.openPopup();
  }

  $("#viewCity").addEventListener("click", () => map.fitBounds(INNSBRUCK_VIEW));
  $("#viewJourney").addEventListener("click", () => {
    const pts = [...new Set([...T.route.flights.flat(), ...T.route.ground])].map((id) => [basePlaces[id].lat, basePlaces[id].lng]);
    map.fitBounds(pts, { padding: [30, 30] });
  });

  function startPinMode(saveId) {
    const s = state.saves.find((x) => x.id === saveId);
    if (!s) return;
    pinTarget = saveId;
    showTab("map");
    $("#pinName").textContent = s.title;
    $("#pinBanner").hidden = false;
    $("#leafletMap").style.cursor = "crosshair";
    setTimeout(() => map.invalidateSize(), 0);
  }
  function endPinMode() {
    pinTarget = null;
    $("#pinBanner").hidden = true;
    $("#leafletMap").style.cursor = "";
  }
  $("#pinCancel").addEventListener("click", endPinMode);

  // ---------------- Itinerary ----------------
  function dayDate(i) {
    if (!state.startDate) return "";
    const d = new Date(state.startDate + "T12:00:00");
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }

  function renderDays() {
    $("#days").innerHTML = state.days.map((d, di) => {
      const items = d.items.map((it) => {
        const p = it.place ? placeById(it.place) : null;
        const color = p ? T.categories[p.cat].color : "#c8c2b6";
        return `<li class="item" data-item="${it.id}">
          <button class="item-main" ${p ? `data-goto="${esc(it.place)}"` : ""} ${p ? "" : "disabled"} title="${p ? "Show on map" : "No map location"}">
            <span class="item-time">${esc(it.time)}</span>
            <span class="item-dot" style="background:${color}"></span>
            <span class="item-text"><div class="item-title">${esc(it.title)}</div>${it.note ? `<div class="item-note">${esc(it.note)}</div>` : ""}</span>
            ${p ? `<span class="item-go">Map →</span>` : ""}
          </button>
          <span class="item-tools">
            <button class="icon-btn" data-act="up" title="Move up" aria-label="Move up">↑</button>
            <button class="icon-btn" data-act="edit" title="Edit" aria-label="Edit">✎</button>
            <button class="icon-btn" data-act="del" title="Delete" aria-label="Delete">✕</button>
          </span>
        </li>`;
      }).join("");
      return `<div class="day" data-day="${d.id}">
        <div class="day-head">
          <span class="day-num">Day ${di + 1}</span>
          <input class="day-title" value="${esc(d.title)}" aria-label="Day title">
          <span class="day-date">${dayDate(di)}</span>
          <button class="icon-btn" data-act="del-day" title="Remove day" aria-label="Remove day">✕</button>
        </div>
        <ul class="items">${items || `<li class="empty">Nothing planned yet.</li>`}</ul>
        <div class="day-foot"><button class="btn ghost sm" data-act="add">+ Add stop</button></div>
      </div>`;
    }).join("");
  }

  $("#days").addEventListener("click", (e) => {
    const go = e.target.closest("[data-goto]");
    if (go) { goToPlace(go.dataset.goto); return; }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const dayEl = btn.closest(".day");
    const day = state.days.find((d) => d.id === dayEl.dataset.day);
    const itemId = btn.closest(".item")?.dataset.item;
    const idx = day.items.findIndex((i) => i.id === itemId);
    switch (btn.dataset.act) {
      case "add": openItemDialog(day.id); break;
      case "edit": openItemDialog(day.id, day.items[idx]); break;
      case "del":
        day.items.splice(idx, 1); save(); renderDays(); break;
      case "up":
        if (idx > 0) { [day.items[idx - 1], day.items[idx]] = [day.items[idx], day.items[idx - 1]]; save(); renderDays(); }
        break;
      case "del-day":
        if (!day.items.length || confirmTap(btn, "Tap again to remove day")) {
          state.days = state.days.filter((d) => d !== day); save(); renderDays(); renderSaves();
        }
        break;
    }
  });
  $("#days").addEventListener("change", (e) => {
    if (!e.target.classList.contains("day-title")) return;
    const day = state.days.find((d) => d.id === e.target.closest(".day").dataset.day);
    day.title = e.target.value.trim() || "Untitled day";
    save(); renderSaves();
  });
  $("#addDay").addEventListener("click", () => {
    state.days.push({ id: uid(), title: "Free day", items: [] });
    save(); renderDays(); renderSaves();
  });

  // Item dialog
  const dlg = $("#itemDialog");
  let editing = null;
  function placeOptions(selected) {
    const groups = {};
    allPlaces().forEach((p) => (groups[p.cat] ||= []).push(p));
    return `<option value="">— No map location —</option>` + Object.entries(groups).map(([cat, ps]) =>
      `<optgroup label="${esc(T.categories[cat].label)}">${ps.map((p) =>
        `<option value="${esc(p.id)}" ${p.id === selected ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>`
    ).join("");
  }
  function dayOptions(selected) {
    return state.days.map((d, i) => `<option value="${d.id}" ${d.id === selected ? "selected" : ""}>Day ${i + 1} — ${esc(d.title)}</option>`).join("");
  }
  function openItemDialog(dayId, item) {
    editing = { dayId, itemId: item?.id || null };
    $("#itemDialogTitle").textContent = item ? "Edit stop" : "Add a stop";
    $("#itemTitle").value = item?.title || "";
    $("#itemTime").value = item?.time || "";
    $("#itemNote").value = item?.note || "";
    $("#itemDay").innerHTML = dayOptions(dayId);
    $("#itemPlace").innerHTML = placeOptions(item?.place || "");
    dlg.showModal();
  }
  $("#itemPlace").addEventListener("change", (e) => {
    if (!$("#itemTitle").value && e.target.value) $("#itemTitle").value = placeById(e.target.value)?.name || "";
  });
  dlg.addEventListener("close", () => {
    if (dlg.returnValue !== "save" || !editing) return;
    const data = {
      title: $("#itemTitle").value.trim(),
      time: $("#itemTime").value.trim(),
      note: $("#itemNote").value.trim(),
      place: $("#itemPlace").value
    };
    if (!data.title) return;
    const fromDay = state.days.find((d) => d.id === editing.dayId);
    const toDay = state.days.find((d) => d.id === $("#itemDay").value) || fromDay;
    if (editing.itemId) {
      const i = fromDay.items.findIndex((x) => x.id === editing.itemId);
      const updated = Object.assign(fromDay.items[i], data);
      if (toDay !== fromDay) { fromDay.items.splice(i, 1); toDay.items.push(updated); }
    } else {
      toDay.items.push({ id: uid(), ...data });
    }
    editing = null;
    save(); renderDays();
  });

  // ---------------- Instagram saves ----------------
  $("#igCat").innerHTML = Object.entries(T.categories)
    .filter(([k]) => k !== "transport" && k !== "stay")
    .map(([k, c]) => `<option value="${k}" ${k === "saved" ? "selected" : ""}>${esc(c.label === "My Instagram saves" ? "Other / not sure" : c.label)}</option>`)
    .join("");

  function cleanIgUrl(raw) {
    let u;
    try { u = new URL(raw.trim()); } catch { return null; }
    if (!/(^|\.)instagram\.com$|(^|\.)instagr\.am$/i.test(u.hostname)) return null;
    u.search = ""; u.hash = "";
    return u.toString();
  }

  $("#igForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = $("#igMsg");
    const url = cleanIgUrl($("#igUrl").value);
    if (!url) { msg.className = "form-msg"; msg.textContent = "That doesn't look like an Instagram link."; return; }
    if (state.saves.some((s) => s.url === url)) { msg.className = "form-msg"; msg.textContent = "You've already saved that one."; return; }
    const title = $("#igTitle").value.trim() || "Instagram find #" + (state.saves.length + 1);
    state.saves.unshift({ id: uid(), url, title, catHint: $("#igCat").value, lat: null, lng: null, added: Date.now() });
    save(); renderSaves();
    $("#igUrl").value = ""; $("#igTitle").value = "";
    msg.className = "form-msg ok"; msg.textContent = "Saved! Pin it on the map or add it to a day.";
  });

  // Paste a link anywhere on the Itinerary tab → pre-fill the form
  document.addEventListener("paste", (e) => {
    if ($("#tab-itinerary").hidden) return;
    if (e.target.closest("input, textarea")) return;
    const text = e.clipboardData?.getData("text") || "";
    if (cleanIgUrl(text)) { $("#igUrl").value = text.trim(); $("#igTitle").focus(); }
  });

  function renderSaves() {
    const ul = $("#saves");
    if (!state.saves.length) { ul.innerHTML = `<li class="empty">No saves yet.</li>`; return; }
    ul.innerHTML = state.saves.map((s) => {
      const c = T.categories[s.catHint] || T.categories.saved;
      const pinned = s.lat != null;
      return `<li class="save" data-save="${s.id}">
        <div class="save-top">
          <div class="save-title">${esc(s.title)}<a class="save-link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\/(www\.)?/, ""))}</a></div>
          <button class="icon-btn" data-sact="del" title="Delete" aria-label="Delete">✕</button>
        </div>
        <div class="save-meta">
          <span class="badge" style="background:${c.color}">${esc(s.catHint === "saved" ? "Saved" : c.label)}</span>
          ${pinned ? `<span>📍 Pinned</span>` : `<span style="color:var(--muted)">Not on the map yet</span>`}
        </div>
        <div class="save-actions">
          ${pinned
            ? `<button class="btn ghost sm" data-sact="show">Show on map</button><button class="btn ghost sm" data-sact="pin">Move pin</button>`
            : `<button class="btn sm" data-sact="pin">📍 Pin on map</button>`}
          <select data-sact="addday" aria-label="Add to a day"><option value="">+ Add to day…</option>${state.days.map((d, i) => `<option value="${d.id}">Day ${i + 1} — ${esc(d.title)}</option>`).join("")}</select>
          ${window.TRIP_NO_EMBEDS ? `<a class="btn ghost sm" href="${esc(s.url)}" target="_blank" rel="noopener">Open ↗</a>` : `<button class="btn ghost sm" data-sact="preview">Preview</button>`}
        </div>
        <div class="ig-embed" hidden></div>
      </li>`;
    }).join("");
  }

  $("#saves").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-sact]");
    if (!btn) return;
    const li = btn.closest(".save");
    const s = state.saves.find((x) => x.id === li.dataset.save);
    switch (btn.dataset.sact) {
      case "del":
        if (!confirmTap(btn, "Delete?")) return;
        state.saves = state.saves.filter((x) => x !== s);
        state.days.forEach((d) => d.items.forEach((it) => { if (it.place === "save-" + s.id) it.place = ""; }));
        save(); renderSaves(); renderDays(); if (map) buildMarkers();
        break;
      case "pin": startPinMode(s.id); break;
      case "show": goToPlace("save-" + s.id); break;
      case "preview": togglePreview(li, s, btn); break;
    }
  });
  $("#saves").addEventListener("change", (e) => {
    if (e.target.dataset.sact !== "addday" || !e.target.value) return;
    const s = state.saves.find((x) => x.id === e.target.closest(".save").dataset.save);
    const day = state.days.find((d) => d.id === e.target.value);
    day.items.push({ id: uid(), time: "", title: s.title, place: s.lat != null ? "save-" + s.id : "", note: "From Instagram" });
    save(); renderDays();
    toast(`Added to Day ${state.days.indexOf(day) + 1}${s.lat == null ? " — pin it so it links to the map" : ""}`);
    e.target.value = "";
  });

  let igScriptLoaded = false;
  function togglePreview(li, s, btn) {
    const box = $(".ig-embed", li);
    if (!box.hidden) { box.hidden = true; box.innerHTML = ""; btn.textContent = "Preview"; return; }
    box.hidden = false; btn.textContent = "Hide";
    box.innerHTML = `<blockquote class="instagram-media" data-instgrm-permalink="${esc(s.url)}" data-instgrm-version="14" style="width:100%;margin:0"><a href="${esc(s.url)}" target="_blank" rel="noopener">View on Instagram</a></blockquote>`;
    if (window.instgrm) { window.instgrm.Embeds.process(); return; }
    if (!igScriptLoaded) {
      igScriptLoaded = true;
      const sc = document.createElement("script");
      sc.async = true; sc.src = "https://www.instagram.com/embed.js";
      document.body.appendChild(sc);
    }
  }

  // ---------------- Food list ----------------
  function renderFoods() {
    $("#foods").innerHTML = T.foods.map((f, i) =>
      `<li><label><input type="checkbox" data-food="${i}" ${state.foods[f.name] ? "checked" : ""}><div><strong>${esc(f.name)}</strong><small>${esc(f.desc)}</small></div></label></li>`
    ).join("");
    $("#foodCount").textContent = `${T.foods.filter((f) => state.foods[f.name]).length} of ${T.foods.length}`;
  }
  $("#foods").addEventListener("change", (e) => {
    const f = T.foods[e.target.dataset.food];
    if (!f) return;
    if (e.target.checked) state.foods[f.name] = true; else delete state.foods[f.name];
    save(); renderFoods();
  });

  // ---------------- Export / import / reset ----------------
  // Export copies a backup code; Import takes that code (or an exported .json file)
  $("#exportBtn").addEventListener("click", () => {
    const text = JSON.stringify(state);
    const box = $("#backupBox");
    box.hidden = false;
    box.value = text;
    const fallback = () => { box.focus(); box.select(); toast("Select all and copy the backup text"); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast("Backup copied — paste it somewhere safe"), fallback);
    else fallback();
  });
  function importText(text) {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data.days)) throw new Error("bad");
      state = Object.assign(seedState(), data);
      save(); renderAll(); if (map) buildMarkers();
      toast("Trip imported");
      return true;
    } catch { toast("That isn't a valid trip backup"); return false; }
  }
  $("#importPasteBtn").addEventListener("click", () => {
    const box = $("#backupBox");
    if (box.hidden || !box.value.trim()) { box.hidden = false; box.value = ""; box.placeholder = "Paste a backup here, then tap Import again"; box.focus(); return; }
    if (importText(box.value.trim())) { box.value = ""; box.hidden = true; }
  });
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importText(await file.text());
    e.target.value = "";
  });
  $("#resetBtn").addEventListener("click", (e) => {
    if (!confirmTap(e.currentTarget, "Tap again to reset the plan")) return;
    const fresh = seedState();
    state.days = fresh.days;
    save(); renderDays(); renderSaves();
    toast("Itinerary reset — ticks, notes and saves kept");
  });

  // ---------------- Boot ----------------
  function renderAll() {
    startInput.value = state.startDate || "";
    renderTimeline(); renderDays(); renderSaves(); renderFoods();
  }
  renderAll();
  syncHeaderHeight();
  // Build the map straight away (off-screen) so its streets are loaded before the Map tab is opened
  if (window.L) setTimeout(() => initMap(), 0);
  // Cache map tiles and the site on the device (GitHub Pages / any https host)
  if ("serviceWorker" in navigator && location.protocol === "https:" && !window.TRIP_NO_EMBEDS) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  const TAB_NAMES = ["timeline", "map", "itinerary"];
  const fromHash = () => { const h = location.hash.replace(/^#\/?/, ""); return TAB_NAMES.includes(h) ? h : null; };
  showTab(fromHash() || "timeline");
  window.addEventListener("hashchange", () => { const t = fromHash(); if (t) showTab(t); });
})();

// Phrases tab: searchable German phrasebook with optional read-aloud.
(() => {
  "use strict";
  const P = window.PHRASES;
  const root = document.getElementById("phrasebook");
  if (!P || !root) return;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const sections = [
    { id: "top20", title: "The 20 to memorise", icon: "⭐", rows: P.top20, lead: "If you learn nothing else, learn these." },
    ...P.groups
  ];

  function rowHtml([de, en, pr]) {
    return `<li class="phrase" data-search="${esc((de + " " + en + " " + pr).toLowerCase())}">
      <div class="phrase-text">
        <div class="phrase-de" lang="de">${esc(de)}</div>
        <div class="phrase-en">${esc(en)}</div>
        ${pr ? `<div class="phrase-pr">${esc(pr)}</div>` : ""}
      </div>
      ${canSpeak ? `<button class="speak" data-say="${esc(de)}" aria-label="Say “${esc(de)}” aloud" title="Hear it">🔊</button>` : ""}
    </li>`;
  }

  root.innerHTML = `
    <div class="pb-tools">
      <input type="search" id="pbSearch" placeholder="Search German or English, e.g. 'bill' or 'Gleis'" aria-label="Search phrases">
      <nav class="pb-chips" aria-label="Phrase sections">
        ${sections.map((s) => `<a class="chip" href="#pb-${s.id}" data-jump="pb-${s.id}">${s.icon} ${esc(s.title)}</a>`).join("")}
        <a class="chip" href="#pb-customs" data-jump="pb-customs">🇦🇹 Customs</a>
        <a class="chip" href="#pb-sounds" data-jump="pb-sounds">🔤 Pronunciation</a>
      </nav>
    </div>

    <div class="pb-emergency" role="note">
      <strong>Emergency numbers</strong>
      ${P.emergency.map(([n, what]) => `<a href="tel:${n}"><b>${n}</b> ${esc(what)}</a>`).join("")}
    </div>

    <p class="pb-empty" id="pbEmpty" hidden>No phrases match that search.</p>

    ${sections.map((s) => `
      <section class="pb-section" id="pb-${s.id}">
        <h2><span aria-hidden="true">${s.icon}</span> ${esc(s.title)} <small>${s.rows.length}</small></h2>
        ${s.lead ? `<p class="hint">${esc(s.lead)}</p>` : ""}
        <ul class="phrases">${s.rows.map(rowHtml).join("")}</ul>
      </section>`).join("")}

    <section class="pb-section pb-static" id="pb-customs">
      <h2><span aria-hidden="true">🇦🇹</span> Austrian customs</h2>
      <div class="customs">
        ${P.customs.map(([t, d]) => `<div class="custom"><strong>${esc(t)}</strong><p>${esc(d)}</p></div>`).join("")}
      </div>
    </section>

    <section class="pb-section pb-static" id="pb-sounds">
      <h2><span aria-hidden="true">🔤</span> Quick pronunciation rules</h2>
      <div class="sounds">
        ${P.pronunciation.map(([l, sound, ex]) => `<div class="sound"><b lang="de">${esc(l)}</b><span>sounds like <em>${esc(sound)}</em></span><small lang="de">${esc(ex)}</small></div>`).join("")}
      </div>
      <p class="tips">💡 ${esc(P.advice)}</p>
    </section>
  `;

  // Search
  const search = document.getElementById("pbSearch");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let any = false;
    root.querySelectorAll(".pb-section").forEach((sec) => {
      if (sec.classList.contains("pb-static")) { sec.hidden = !!q; return; }
      let shown = 0;
      sec.querySelectorAll(".phrase").forEach((li) => {
        const hit = !q || li.dataset.search.includes(q);
        li.hidden = !hit;
        if (hit) shown++;
      });
      sec.hidden = shown === 0;
      if (shown) any = true;
    });
    document.getElementById("pbEmpty").hidden = any || !q;
  });

  // Section chips scroll within the page (don't change the tab hash)
  root.addEventListener("click", (e) => {
    const jump = e.target.closest("[data-jump]");
    if (jump) {
      e.preventDefault();
      if (search.value) { search.value = ""; search.dispatchEvent(new Event("input")); }
      const el = document.getElementById(jump.dataset.jump);
      const offset = document.querySelector(".top").offsetHeight + document.querySelector(".pb-tools").offsetHeight + 8;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "auto" });
      return;
    }
    const btn = e.target.closest(".speak");
    if (btn) say(btn.dataset.say, btn);
  });

  // Read aloud with a German voice where the device has one
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    voice = vs.find((v) => v.lang === "de-AT") || vs.find((v) => v.lang === "de-DE") || vs.find((v) => v.lang?.startsWith("de")) || null;
  }
  if (canSpeak) {
    pickVoice();
    speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
  }
  function say(text, btn) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, ""));
      u.lang = voice?.lang || "de-DE";
      if (voice) u.voice = voice;
      u.rate = 0.85;
      btn.classList.add("speaking");
      u.onend = u.onerror = () => btn.classList.remove("speaking");
      speechSynthesis.speak(u);
    } catch { /* speech not available */ }
  }
})();

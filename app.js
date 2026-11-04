/* Логіка сторінки: мови, пензель у банері, калькулятор, картини, контакти, форма. */
(function () {
  "use strict";

  /* ===== Налаштування — заміни на свої ===== */
  const CONFIG = {
    brand: "Brush’n’Roll",          // назва студії
    email: "mryndzak38@gmail.com",    // куди приходять заявки (видно на сайті)
    phone: "",                        // телефон, напр. "+48 512 345 678"; порожньо — рядок схований
    instagram: "",                    // нік без @; порожньо — посилання сховане
    minOrder: 900,                    // мінімальна сума замовлення муралу, zł
    volume: { from: 5, to: 60, max: 0.3 }, // знижка за площу: 0 до from м², плавно росте до max (30%) від to м²
    levels: { simple: 220, medium: 320, high: 450, real: 900 }, // zł за м² за рівнем деталізації (ринок PL 2026: 150–300 / 250–400 / 350–500 / 400–900)
    paintings: {                      // картина = основа + м² полотна × ставка рівня, округлено до 50 zł
      base: 300,                      // підрамник, ґрунт, лак, доставка й монтаж, zł
      min: 675,                       // мінімальна ціна картини, zł (−25% від 900, листопад 2026)
      side: [20, 300],                // допустима довжина сторони полотна, см
      rates: { simple: 750, medium: 1500, high: 2250, real: 3150 }, // zł за м² полотна, знижено на 25% у листопаді 2026 (ринок PL 2026: реалістична олія 50×70 на замовлення ≈ 1850–1950 zł, проста абстракція 50×70–100×70 ≈ 450–800 zł)
      sizes: { s: { w: 50, h: 70 }, m: { w: 80, h: 100 }, l: { w: 100, h: 150 }, xl: { w: 120, h: 240 } } // готові формати, см
    }
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = k => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const f1 = n => Math.round(n * 10) / 10;
  const root = document.documentElement;
  const RM = root.classList.contains("rm");

  /* ===== Тексти й мови ===== */
  const LANGS = {
    pl: { label: "PL", loc: "pl-PL", og: "pl_PL", m2: "m²", cm: "cm" },
    en: { label: "EN", loc: "en-GB", og: "en_GB", m2: "m²", cm: "cm" },
    uk: { label: "UA", loc: "uk-UA", og: "uk_UA", m2: "м²", cm: "см" }
  };
  const T = window.T || {};
  const pl = {};
  $$("[data-i18n]").forEach(el => { pl[el.dataset.i18n] = el.innerHTML.trim(); });
  $$("[data-i18n-aria]").forEach(el => { pl[el.dataset.i18nAria] = el.getAttribute("aria-label"); });
  $$("[data-i18n-ph]").forEach(el => { pl[el.dataset.i18nPh] = el.getAttribute("placeholder"); });
  T.pl = Object.assign(pl, T.pl);

  let lang = "pl";
  function t(key, vars) {
    let s = (T[lang] && T[lang][key]) ?? T.pl[key] ?? "";
    s = s.replace(/\{brand\}/g, CONFIG.brand);
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, n) => (n in vars ? vars[n] : m));
    return s;
  }
  const fmtN = (n, d = 2) => new Intl.NumberFormat(LANGS[lang].loc, { maximumFractionDigits: d }).format(n);
  const money = n => new Intl.NumberFormat(LANGS[lang].loc, { maximumFractionDigits: 0 }).format(n) + " zł";

  function initialLang() {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "ua") return "uk";
    if (LANGS[q]) return q;
    try { const s = localStorage.getItem("mural-lang"); if (LANGS[s]) return s; } catch (e) { /* без сховища */ }
    for (const n of navigator.languages || [navigator.language || ""]) {
      const c = String(n).slice(0, 2).toLowerCase();
      if (c === "pl" || c === "en" || c === "uk") return c;
    }
    return "pl";
  }

  function setLang(l, fromUser) {
    lang = LANGS[l] ? l : "pl";
    root.lang = lang;
    $$("[data-i18n]").forEach(el => { el.innerHTML = t(el.dataset.i18n); });
    $$("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    $$("[data-i18n-ph]").forEach(el => el.setAttribute("placeholder", t(el.dataset.i18nPh)));
    $$("[data-brand]").forEach(el => { el.textContent = CONFIG.brand; });
    document.title = t("meta.title");
    const md = $('meta[name="description"]'); if (md) md.content = t("meta.desc");
    const og = $('meta[property="og:locale"]'); if (og) og.content = LANGS[lang].og;
    $$(".lang-cur").forEach(el => { el.textContent = LANGS[lang].label; });
    $$('[role="menuitemradio"][data-lang]').forEach(b => b.setAttribute("aria-checked", String(b.dataset.lang === lang)));
    $$(".seg [data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    syncBurgerLabel();
    renderPaint(true);
    renderCalc(true);
    formStatus("");
    if (fromUser) {
      try { localStorage.setItem("mural-lang", lang); } catch (e) { /* без сховища */ }
      const u = new URL(location.href); u.searchParams.set("lang", lang);
      history.replaceState(history.state, "", u);
    }
  }

  /* Мовне меню в шапці */
  const langWrap = $("#lang"), langBtn = $(".lang-btn"), langMenu = $("#lang-menu");
  const langItems = $$("button", langMenu);
  function openLang(open, focusItem) {
    langMenu.hidden = !open;
    langBtn.setAttribute("aria-expanded", String(open));
    if (open && focusItem) (langMenu.querySelector('[aria-checked="true"]') || langItems[0]).focus();
  }
  langBtn.addEventListener("click", e => openLang(langMenu.hidden, e.detail === 0));
  langBtn.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openLang(true, true); }
  });
  langMenu.addEventListener("keydown", e => {
    const i = langItems.indexOf(document.activeElement);
    let n = -1;
    if (e.key === "ArrowDown") n = (i + 1) % langItems.length;
    else if (e.key === "ArrowUp") n = (i - 1 + langItems.length) % langItems.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = langItems.length - 1;
    else if (e.key === "Tab") openLang(false);
    if (n > -1) { e.preventDefault(); langItems[n].focus(); }
  });
  document.addEventListener("click", e => {
    if (!langMenu.hidden && !langWrap.contains(e.target)) openLang(false);
    const b = e.target.closest("[data-lang]");
    if (!b) return;
    setLang(b.dataset.lang, true);
    if (langMenu.contains(b)) { openLang(false); langBtn.focus(); }
  });

  /* Бургер-меню на мобільному */
  const burger = $("#burger"), menu = $("#menu");
  function syncBurgerLabel() {
    burger.setAttribute("aria-label", t(burger.getAttribute("aria-expanded") === "true" ? "menu.close" : "menu.open"));
  }
  function setMenu(open) {
    menu.hidden = !open;
    burger.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
    syncBurgerLabel();
  }
  burger.addEventListener("click", () => setMenu(menu.hidden));
  menu.addEventListener("click", e => { if (e.target.closest("[data-close]")) setMenu(false); });
  matchMedia("(min-width: 901px)").addEventListener("change", e => { if (e.matches) setMenu(false); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!langMenu.hidden) { openLang(false); langBtn.focus(); }
    else if (!menu.hidden) { setMenu(false); burger.focus(); }
  });

  /* Шапка після прокрутки */
  const hdr = $("#hdr");
  const onHdr = () => hdr.classList.toggle("scrolled", scrollY > 8);

  /* ===== Банер: пензель відкриває кольоровий мурал під олівцевим ескізом =====
     Маска — сім горизонтальних мазків «змійкою»; кожен мазок має рвані краї
     з тонших копій, що трохи відстають. Пензель іде за кінцем мазка. */
  const hero = $("#hero"), art = $(".art"), strokesG = $("#strokes"), maskFull = $("#mask-full");
  const brush = $("#brush"), brushIn = $("#brush-in");
  const meterFill = $("#meter-fill"), meterVal = $("#meter-val"), hint = $("#scroll-hint");
  const NS = "http://www.w3.org/2000/svg";
  const VW = 1536, VH = 1024, svgArt = $("#art");
  const segs = [];
  let span = 0, BS = 1, S0 = 200, box = "";

  function seeded(a) {
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let x = Math.imul(a ^ a >>> 15, 1 | a);
      x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }
  function mk(d, w, extra) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("stroke-width", w);
    for (const k in extra) p.setAttribute(k, extra[k]);
    strokesG.appendChild(p);
    return p;
  }
  function dash(el, L, a) {
    a = clamp(a, 0, L);
    el.style.visibility = a > 0 ? "visible" : "hidden";
    el.style.strokeDashoffset = f1(L - a);
  }
  function drawRow(row, a) {
    if (row.a === a) return;
    row.a = a;
    dash(row.main, row.L, a);
    row.edges.forEach(e => dash(e.el, row.L, a >= row.L ? row.L : a - e.lag));
  }

  /* Мурал на весь екран обрізаний під його пропорції (slice), тож мазки йдуть лише видимою
     частиною: пензель не зникає за краєм. На вузькому екрані рядів більше, а пензель менший. */
  function buildHero() {
    const { width: w, height: h } = svgArt.getBoundingClientRect();
    if (!w || !h) return false;
    const k = Math.max(w / VW, h / VH), vw = w / k, vh = h / k, key = Math.round(vw) + "x" + Math.round(vh);
    if (key === box) return false;
    box = key;
    strokesG.textContent = "";
    segs.length = 0;
    const rows = clamp(Math.round(vh / Math.min(vw * .17, 120)), 6, 12), SW = Math.round(vh / rows * 1.3);
    const X0 = (VW - vw) / 2 - 60, X1 = (VW + vw) / 2 + 60, T0 = (VH - vh) / 2;
    const EDGES = [
      { o: -(SW / 2 + 3), w: 10, lag: 70, op: .5 },
      { o: SW / 2 + 3, w: 10, lag: 45, op: .5 },
      { o: -(SW / 2 - 7), w: 14, lag: 22, op: .85 },
      { o: SW / 2 - 7, w: 14, lag: 34, op: .85 }
    ];
    BS = SW / 160;
    S0 = SW;
    const rnd = seeded(7), j = () => (rnd() - .5) * SW / 9;
    let prev = null;
    for (let i = 0; i < rows; i++) {
      const y = T0 + vh * (i + .5) / rows, dir = i % 2 ? -1 : 1;
      const xa = dir > 0 ? X0 : X1, xb = dir > 0 ? X1 : X0;
      const d = `M${f1(xa)} ${f1(y + j())}Q${f1((3 * xa + xb) / 4)} ${f1(y + j())} ${VW / 2} ${f1(y + j())}T${f1(xb)} ${f1(y + j())}`;
      const edges = EDGES.map(e => ({
        lag: e.lag,
        el: mk(d, e.w, { transform: `translate(0 ${e.o})`, "stroke-opacity": e.op, "stroke-linecap": "round" })
      }));
      const main = mk(d, SW, { "stroke-linecap": "butt" });
      const L = main.getTotalLength();
      [main, ...edges.map(e => e.el)].forEach(p => { p.style.strokeDasharray = `${f1(L)} ${f1(L + 40)}`; });
      const row = { main, edges, L, dir, a: -1, start: main.getPointAtLength(0), end: main.getPointAtLength(L) };
      drawRow(row, 0);
      if (prev) segs.push({ len: SW, from: prev.end, to: row.start, dir: prev.dir });
      segs.push({ len: L, row });
      prev = row;
    }
    span = segs.reduce((s, g) => s + g.len, 0);
    return true;
  }

  function paint(p) {
    if (!segs.length) return;
    const pp = clamp((p - .03) / .85), r = ease(clamp((p - .9) / .08));
    let rest = S0 + pp * (span - S0), at = null;
    for (const g of segs) {
      const a = clamp(rest, 0, g.len);
      if (g.row) drawRow(g.row, a);
      if (!at && rest <= g.len) at = { g, a };
      rest -= g.len;
    }
    if (!at) { const g = segs[segs.length - 1]; at = { g, a: g.len }; }

    let x, y, sx, ang = 0;
    const g = at.g;
    if (g.row) {
      const pt = g.row.main.getPointAtLength(at.a);
      const nx = g.row.main.getPointAtLength(Math.min(g.row.L, at.a + 6));
      const bk = at.a + 6 > g.row.L ? g.row.main.getPointAtLength(at.a - 6) : pt;
      x = pt.x; y = pt.y; sx = g.row.dir;
      ang = Math.atan2(nx.y - bk.y, sx * (nx.x - bk.x)) * 180 / Math.PI;
    } else {
      const k = ease(at.a / g.len);
      x = g.from.x + (g.to.x - g.from.x) * k;
      y = g.from.y + (g.to.y - g.from.y) * k;
      sx = g.dir * Math.cos(Math.PI * k);
    }
    const tilt = 18 + Math.sin((S0 + pp * span) * .011) * 4;
    brush.setAttribute("transform", `translate(${f1(x + r * 280)} ${f1(y + r * 220)})`);
    brush.style.opacity = String(1 - r);
    brushIn.setAttribute("transform", `scale(${(sx * BS).toFixed(3)} ${BS.toFixed(3)}) rotate(${f1(ang + tilt)})`);
    maskFull.setAttribute("opacity", r.toFixed(3));

    meterFill.style.transform = `scaleX(${pp.toFixed(4)})`;
    meterVal.textContent = Math.round(pp * 100) + "%";
    hint.classList.toggle("off", p > .02);
    art.classList.toggle("done", r > .98);
  }

  let tp = 0, rp = 0, heroRaf = 0;
  function heroTarget() {
    const rc = hero.getBoundingClientRect(), h = rc.height - innerHeight;
    return h > 0 ? clamp(-rc.top / h) : 0;
  }
  function heroTick() {
    rp += (tp - rp) * .14;
    if (Math.abs(tp - rp) < .0004) rp = tp;
    paint(rp);
    heroRaf = rp === tp ? 0 : requestAnimationFrame(heroTick);
  }
  function onHero() {
    tp = heroTarget();
    if (!heroRaf) heroRaf = requestAnimationFrame(heroTick);
  }
  if (!RM) {
    maskFull.setAttribute("opacity", "0");
    buildHero();
    rp = tp = heroTarget();
    paint(rp);
    addEventListener("resize", () => { if (buildHero()) paint(rp); onHero(); });
  }

  /* ===== Процес: пензель веде лінію до поточного кроку ===== */
  const proc = $(".proc"), track = $(".track"), nodes = $$(".steps .node");
  function onProc() {
    const vh = innerHeight, r = track.getBoundingClientRect();
    const across = r.width > r.height;
    const p = across ? clamp((vh * .8 - r.top) / (vh * .45)) : clamp((vh * .6 - r.top) / r.height);
    proc.style.setProperty("--p", p.toFixed(4));
    const reach = across ? r.left + p * r.width : r.top + p * r.height;
    nodes.forEach(n => {
      const b = n.getBoundingClientRect();
      n.parentNode.classList.toggle("on", p > 0 && (across ? b.left + b.width / 2 : b.top + b.height / 2) <= reach + 2);
    });
  }
  // на мобільному лінія вертикальна: обрізаємо її по центру останнього кроку
  function fitTrack() {
    const n = nodes[nodes.length - 1], y = n.parentNode.offsetTop + n.offsetTop + n.offsetHeight / 2;
    track.style.bottom = matchMedia("(max-width: 900px)").matches ? proc.offsetHeight - y + "px" : "";
  }
  fitTrack();
  if (document.fonts) document.fonts.ready.then(fitTrack);
  addEventListener("resize", fitTrack);
  if (!RM) { onProc(); addEventListener("resize", onProc); }

  addEventListener("scroll", () => { onHdr(); if (!RM) { onHero(); onProc(); } }, { passive: true });
  onHdr();

  /* ===== Калькулятор муралу: площа × рівень деталізації ===== */
  const calc = $("#calc");
  const range = $("#area-range"), num = $("#area-num"), wIn = $("#w"), hIn = $("#h");
  const totalEl = $("#total"), formulaEl = $("#formula"), minEl = $("#min-note"), liveEl = $("#calc-live");
  const discEl = $("#disc"), volEl = $("#vol-hint");
  const quoteBox = $("#f-quote"), quotePrev = $("#quote-prev");
  const RMIN = +range.min, RMAX = +range.max;
  let area = +range.value || 8, liveT = 0;
  const parse = v => parseFloat(String(v).replace(",", "."));
  const areaTxt = a => `${fmtN(a, 1)} ${LANGS[lang].m2}`;

  // Знижка за площу росте за логарифмом, тож ціна за м² падає, а сума все одно росте з площею
  function volDisc(a) {
    const V = CONFIG.volume;
    return V.max * clamp(Math.log(a / V.from) / Math.log(V.to / V.from));
  }

  function quote() {
    const level = (calc.querySelector('[name="level"]:checked') || {}).value || "medium";
    const base = CONFIG.levels[level], disc = volDisc(area);
    const rate = Math.round(base * (1 - disc));
    const rounded = Math.round(area * rate / 10) * 10;
    const sum = Math.max(CONFIG.minOrder, rounded);
    return { level, base, rate, disc, area, sum, min: rounded < CONFIG.minOrder };
  }

  function quoteLine(q = quote()) {
    return t("quote.line", { level: t("lvl." + q.level), area: areaTxt(q.area), total: money(q.sum) });
  }

  // Плавно докручує суму в елементі до нового значення
  function counter(el) {
    let shown = 0, raf = 0;
    return (v, instant) => {
      cancelAnimationFrame(raf);
      if (instant || RM) { shown = v; el.textContent = money(v); return; }
      const from = shown, t0 = performance.now();
      const step = now => {
        const k = clamp((now - t0) / 420);
        shown = Math.round(from + (v - from) * (1 - Math.pow(1 - k, 3)));
        el.textContent = money(shown);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
  }
  const countTo = counter(totalEl);

  function renderCalc(instant) {
    const q = quote();
    $$(".rate[data-rate]").forEach(el => { el.textContent = t("rate", { rate: fmtN(CONFIG.levels[el.dataset.rate]) }); });
    countTo(q.sum, instant);
    formulaEl.textContent = `${areaTxt(q.area)} × ${t("rate", { rate: fmtN(q.rate) })}`;
    const pct = Math.round(q.disc * 100);
    discEl.hidden = !pct;
    discEl.textContent = pct ? t("calc.disc", { pct, base: fmtN(q.base), rate: t("rate", { rate: fmtN(q.rate) }) }) : "";
    volEl.textContent = t("calc.vol", { from: fmtN(CONFIG.volume.from), to: fmtN(CONFIG.volume.to), max: Math.round(CONFIG.volume.max * 100) });
    minEl.hidden = !q.min;
    minEl.textContent = q.min ? t("calc.minNote", { min: money(CONFIG.minOrder) }) : "";
    $("#p0").textContent = money(0);
    $("#p1").textContent = money(q.sum);
    range.style.setProperty("--fill", ((clamp(q.area, RMIN, RMAX) - RMIN) / (RMAX - RMIN) * 100).toFixed(1) + "%");
    clearTimeout(liveT);
    liveT = setTimeout(() => { liveEl.textContent = t("calc.live", { total: money(q.sum) }); }, 600);
    renderQuotePrev();
  }

  function setArea(v, from) {
    area = clamp(f1(v), 1, 500);
    if (from !== range) range.value = clamp(area, RMIN, RMAX);
    if (from !== num) num.value = area;
    if (from === range || from === num) { wIn.value = ""; hIn.value = ""; }
    renderCalc(false);
  }

  calc.addEventListener("change", e => { if (e.target.name === "level") renderCalc(false); });
  range.addEventListener("input", () => setArea(+range.value, range));
  num.addEventListener("input", () => { const v = parse(num.value); if (v > 0) setArea(v, num); });
  num.addEventListener("blur", () => { num.value = area; });
  [wIn, hIn].forEach(el => el.addEventListener("input", () => {
    const w = parse(wIn.value), h = parse(hIn.value);
    if (w > 0 && h > 0) setArea(w * h, el);
  }));

  /* ===== Калькулятор картини: формат полотна × рівень деталізації ===== */
  const pcalc = $("#pcalc"), pwIn = $("#pw"), phIn = $("#ph");
  const pFormulaEl = $("#pformula"), pNoteEl = $("#pnote"), pLiveEl = $("#pcalc-live"), pSizeEl = $("#pdim-txt");
  const P = CONFIG.paintings, countP = counter($("#ptotal"));
  let pdim = { ...P.sizes.m }, pCut = false, pLiveT = 0;
  const cmTxt = d => `${fmtN(d.w)} × ${fmtN(d.h)} ${LANGS[lang].cm}`;
  const pLevel = () => (pcalc.querySelector('[name="plevel"]:checked') || {}).value || "medium";

  function pquote(level = pLevel(), d = pdim) {
    const area = d.w * d.h / 1e4, rate = P.rates[level];
    const rounded = Math.round((P.base + area * rate) / 50) * 50;
    const sum = Math.max(P.min, rounded);
    return { level, rate, area, sum, min: rounded < P.min };
  }

  function paintLine(q = pquote()) {
    return t("paint.line", { level: t("lvl." + q.level), size: cmTxt(pdim), total: money(q.sum) });
  }

  function renderPaint(instant) {
    const q = pquote(), m2 = a => `${fmtN(a, 2)} ${LANGS[lang].m2}`;
    $$("[data-prate]").forEach(el => { el.textContent = money(pquote(el.dataset.prate).sum); });
    $$("[data-size]").forEach(el => { el.textContent = cmTxt(P.sizes[el.dataset.size]); });
    $$("[data-pprice]").forEach(el => { el.textContent = money(pquote(q.level, P.sizes[el.dataset.pprice]).sum); });
    countP(q.sum, instant);
    pSizeEl.textContent = `${cmTxt(pdim)} · ${m2(q.area)}`;
    pFormulaEl.textContent = t("pcalc.formula", { area: m2(q.area), rate: t("rate", { rate: fmtN(q.rate) }), base: money(P.base) });
    const note = pCut ? t("pcalc.range", { min: fmtN(P.side[0]), max: fmtN(P.side[1]) }) : q.min ? t("calc.minNote", { min: money(P.min) }) : "";
    pNoteEl.hidden = !note;
    pNoteEl.textContent = note;
    $("#pp0").textContent = money(0);
    $("#pp1").textContent = money(q.sum);
    clearTimeout(pLiveT);
    pLiveT = setTimeout(() => { pLiveEl.textContent = t("calc.live", { total: money(q.sum) }); }, 600);
    renderQuotePrev();
  }

  pcalc.addEventListener("change", e => {
    if (e.target.name === "psize") { pdim = { ...P.sizes[e.target.value] }; pwIn.value = ""; phIn.value = ""; pCut = false; }
    if (e.target.name === "psize" || e.target.name === "plevel") renderPaint(false);
  });
  [pwIn, phIn].forEach(el => el.addEventListener("input", () => {
    const w = Math.round(parse(pwIn.value)), h = Math.round(parse(phIn.value));
    if (!(w > 0 && h > 0)) return;
    const [lo, hi] = P.side;
    pdim = { w: clamp(w, lo, hi), h: clamp(h, lo, hi) };
    pCut = pdim.w !== w || pdim.h !== h;
    $$('[name="psize"]', pcalc).forEach(r => { r.checked = P.sizes[r.value].w === pdim.w && P.sizes[r.value].h === pdim.h; });
    renderPaint(false);
  }));
  [calc, pcalc].forEach(f => f.addEventListener("submit", e => e.preventDefault()));

  /* ===== Форма: відкриває поштову програму з готовим листом ===== */
  const form = $("#form"), statusEl = $("#form-status");
  const kind = () => (form.querySelector('[name="kind"]:checked') || {}).value || "mural";
  function setKind(v) {
    const r = form.querySelector(`[name="kind"][value="${v}"]`);
    if (r) r.checked = true;
    quoteBox.checked = true;
    renderQuotePrev();
  }
  function renderQuotePrev() {
    quotePrev.hidden = !quoteBox.checked;
    quotePrev.textContent = quoteBox.checked ? (kind() === "painting" ? paintLine() : quoteLine()) : "";
  }
  $("#calc-cta").addEventListener("click", () => setKind("mural"));
  $("#art-cta").addEventListener("click", () => setKind("painting"));
  form.addEventListener("change", e => { if (e.target.name === "kind" || e.target === quoteBox) renderQuotePrev(); });

  function formStatus(msg, err) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", !!err);
  }
  form.addEventListener("submit", e => {
    e.preventDefault();
    const field = n => form.elements.namedItem(n);
    const val = n => field(n).value.trim();
    const name = val("name"), contact = val("contact"), place = val("place"), msg = val("msg");
    if (!name || !contact) {
      formStatus(t("form.err"), true);
      field(name ? "contact" : "name").focus();
      return;
    }
    const isP = kind() === "painting";
    const lines = [t(isP ? "form.kPaint" : "form.kMural"), "", `${t("form.name")}: ${name}`, `${t("form.contact")}: ${contact}`];
    if (place) lines.push(`${t("form.place")}: ${place}`);
    if (msg) lines.push("", msg);
    if (quoteBox.checked) lines.push("", isP ? paintLine() : quoteLine());
    const subject = t(isP ? "form.subjectP" : "form.subject", { name });
    location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
    formStatus(t("form.sent", { email: CONFIG.email }));
  });

  /* ===== Контакти ===== */
  const tel = CONFIG.phone.replace(/[^\d+]/g, "");
  $("#c-phone").hidden = !tel;
  $$('[data-cfg="phone"]').forEach(a => { a.href = "tel:" + tel; a.textContent = CONFIG.phone; });
  $$('[data-cfg="email"]').forEach(a => { a.href = "mailto:" + CONFIG.email; a.textContent = CONFIG.email; });
  const ig = CONFIG.instagram.replace(/^@/, "");
  $("#c-ig").hidden = !ig;
  $$('[data-cfg="instagram"]').forEach(a => { a.href = "https://www.instagram.com/" + encodeURIComponent(ig) + "/"; a.textContent = "@" + ig; });

  /* ===== Поява блоків і рік ===== */
  const reveals = $$("[data-reveal]");
  if (!RM && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add("in"));
  }
  $("#yr").textContent = new Date().getFullYear();

  setLang(initialLang(), false);
})();

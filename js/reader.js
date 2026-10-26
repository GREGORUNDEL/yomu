/* yomu — the reader: text only. Tap a word → small glass popover; «Разбор» → sentence breakdown sheet;
   swipe from the left screen edge → back to the list. */
"use strict";

const R = { id: null, doc: null, sel: null, sentences: {} };

const tcy = (s) => P.dir === "v" ? s.replace(/(^|[^0-9])([0-9]{2})(?![0-9])/g, '$1<span class="tcy">$2</span>') : s;
function rubyHtml(t) {
  if (!t.fu) return tcy(esc(t.t));
  return t.fu.map(([seg, r]) => r ? `<ruby>${esc(seg)}<rt>${esc(r)}</rt></ruby>` : tcy(esc(seg))).join("");
}
const baseOf = (t) => t.b || t.t;
function readingOf(t) {
  if (t.br) return t.br;
  if (!t.b && t.fu) return t.fu.map(([seg, r]) => r || seg).join("");
  return "";
}

function renderText(doc) {
  R.sentences = {};
  const html = (doc.paragraphs || []).map((p) => "<p>" + p.map((se) => {
    R.sentences[se.id] = se;
    return `<span class="sen" data-s="${esc(se.id)}">` + se.tokens.map((t, i) =>
      t.punct ? tcy(esc(t.t)) : `<span class="w" data-i="${i}">${rubyHtml(t)}</span>`).join("") + "</span>";
  }).join("") + "</p>").join("") + '<div class="text-end" aria-hidden="true">終</div>';
  $("text").innerHTML = html;
}

/* ================= open / close ================= */
async function openReader(id, opts) {
  opts = opts || {};
  let doc = cachedText(id);
  const rd = $("reader"), sc = $("readerScroll");
  R.id = id; R.doc = doc; closePop();
  if (doc) renderText(doc);
  else $("text").innerHTML = `<p style="color:var(--ink-muted);font-family:var(--ui);font-size:17px">Загружаю текст…</p>`;
  rd.hidden = false; rd.style.transition = "none"; rd.style.transform = reduceMotion() ? "none" : "translateX(100%)";
  sc.scrollTop = 0; sc.scrollLeft = 0;
  if (doc) restorePos(opts.sid, opts.flash);
  requestAnimationFrame(() => requestAnimationFrame(() => { rd.style.transition = "transform .36s cubic-bezier(.2,.8,.2,1)"; rd.style.transform = "none"; }));
  const fresh = await fetchText(id);
  if (R.id !== id) return;
  if (fresh && (!doc || JSON.stringify(fresh) !== JSON.stringify(doc))) {
    const keep = currentSid(); R.doc = fresh; renderText(fresh); restorePos(doc ? keep : opts.sid, !doc && opts.flash);
  } else if (!doc && !fresh) {
    $("text").innerHTML = `<p style="color:var(--ink-muted);font-family:var(--ui);font-size:17px">Не удалось загрузить текст. ${navigator.onLine ? "Проверь токен в настройках." : "Нет сети."}<br>Свайп от левого края — назад.</p>`;
  }
}
function closeReader(animated) {
  const rd = $("reader"); if (rd.hidden) return;
  saveReaderPos(); closePop(); if (Sheet.open) closeSheet();
  const done = () => { rd.hidden = true; rd.style.transform = ""; rd.style.transition = ""; rd.classList.remove("edge"); under().forEach((n) => { n.style.transform = ""; n.style.transition = ""; }); R.id = null; renderLists(); };
  if (animated === false || reduceMotion()) return done();
  rd.style.transition = "transform .28s cubic-bezier(.2,.8,.2,1)"; rd.style.transform = "translateX(100%)";
  under().forEach((n) => { n.style.transition = "transform .28s cubic-bezier(.2,.8,.2,1)"; n.style.transform = "none"; });
  setTimeout(done, 290);
}

/* what sits under the reader and moves a little while it is swiped away (fixed elements are moved one by one:
   a transform on their parent would re-anchor them to it) */
const under = () => [$("pages"), document.querySelector(".seg-wrap"), $("fab")];

/* ================= position & progress ================= */
const vertical = () => P.dir === "v";
function scrollFrac() {
  const sc = $("readerScroll");
  if (vertical()) { const m = sc.scrollWidth - sc.clientWidth; return m > 0 ? Math.abs(sc.scrollLeft) / m : 1; }
  const m = sc.scrollHeight - sc.clientHeight; return m > 0 ? sc.scrollTop / m : 1;
}
function currentSid() {
  const sc = $("readerScroll"), r = sc.getBoundingClientRect(), top = parseFloat(getComputedStyle($("text")).paddingTop) || 60;
  const pts = vertical() ? [[r.right - 40, r.top + top + 30], [r.right - 70, r.top + top + 30], [r.right - 40, r.top + r.height / 2]]
                         : [[r.left + 40, top + 20], [r.left + r.width / 2, top + 30], [r.left + r.width / 2, top + 70]];
  for (const [x, y] of pts) { const el = document.elementFromPoint(x, y), s = el && el.closest && el.closest(".sen"); if (s) return s.dataset.s; }
  return null;
}
function saveReaderPos() { if (!R.id || !R.doc) return; savePos(R.id, currentSid(), scrollFrac()); }
function restorePos(sid, flash) {
  sid = sid || (S.pos[R.id] && S.pos[R.id].sid); if (!sid) return;
  const el = $("text").querySelector(`.sen[data-s="${CSS.escape(sid)}"]`); if (!el) return;
  const sc = $("readerScroll"), rects = el.getClientRects(); if (!rects.length) return;
  const first = rects[0], box = sc.getBoundingClientRect(), cs = getComputedStyle($("text"));
  if (vertical()) sc.scrollLeft += first.right - (box.right - (parseFloat(cs.paddingRight) || 26));
  else if (first.top > (parseFloat(cs.paddingTop) || 80) + 4) sc.scrollTop += first.top - (parseFloat(cs.paddingTop) || 80);
  if (flash) { el.classList.add("hl"); setTimeout(() => el.classList.remove("hl"), 1600); }
}
(() => {
  let t = null;
  document.addEventListener("DOMContentLoaded", () => {
    $("readerScroll").addEventListener("scroll", () => {
      if (R.sel && Math.abs(scrollDelta()) > 6) closePop();
      clearTimeout(t); t = setTimeout(saveReaderPos, 400);
    }, { passive: true });
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveReaderPos(); });
})();
let scroll0 = 0;
function scrollDelta() { const sc = $("readerScroll"); return (vertical() ? sc.scrollLeft : sc.scrollTop) - scroll0; }

/* ================= word popover ================= */
/* iOS home-screen apps blur the strip under the status bar — about 35pt below the safe-area inset
   (measured on iPhone 14 Pro Max). Nothing interactive goes there. --safe-top is a CSS max(), so it is measured, not parsed. */
let blurPx = null;
function blurZone() {
  if (blurPx == null) {
    const d = document.createElement("div"); d.style.cssText = "position:fixed;top:0;left:0;width:1px;height:var(--safe-top);visibility:hidden;pointer-events:none";
    document.body.appendChild(d); blurPx = d.offsetHeight + 40; d.remove();
  }
  return blurPx;
}
window.addEventListener("resize", () => { blurPx = null; });
function selectWord(w) {
  const sen = w.closest(".sen"), se = R.sentences[sen.dataset.s], t = se && se.tokens[+w.dataset.i]; if (!t) return;
  if (R.sel && R.sel.w === w) { closePop(); return; }
  clearSel();
  R.sel = { w, sen, se, t }; w.classList.add("sel"); sen.classList.add("hl");
  const sc = $("readerScroll"); scroll0 = vertical() ? sc.scrollLeft : sc.scrollTop;
  const b = baseOf(t), br = readingOf(t), particle = t.p === "частица";
  const changed = t.b && t.b !== t.t;
  const pop = $("pop");
  pop.innerHTML = `<div class="pop-head"><span class="pop-b ja" lang="ja">${esc(b)}</span>${br && br !== b ? `<span class="pop-r ja" lang="ja">${esc(br)}</span>` : ""}</div>
    ${t.g ? `<div class="pop-g">${esc(t.g)}</div>` : ""}
    ${t.f ? `<div class="pop-f">${changed ? `<i class="ja" lang="ja">${esc(t.t)}</i> — ` : ""}${esc(t.f)}</div>` : ""}
    ${t.p ? `<span class="pop-p">${esc(t.p)}</span>` : ""}
    <div class="pop-act">${particle ? "" : addBtn(b, br)}<button class="btn" id="popParse">${svg("parse")}Разбор</button></div>`;
  pop.hidden = false; pop.classList.remove("on");
  placePop(w);
  requestAnimationFrame(() => pop.classList.add("on"));
  const ab = $("popAdd"); if (ab) ab.onclick = () => { addWord({ b, br, g: t.g }, se); ab.outerHTML = addBtn(b, br); };
  $("popParse").onclick = () => openBreakdown(se);
}
const addBtn = (b, br) => inVocab(b, br) ? `<button class="btn done" disabled>${svg("check")}В словаре</button>` : `<button class="btn fill" id="popAdd">${svg("plus")}В словарь</button>`;
function addWord(e, se) {
  const s = se.tokens.map((t) => t.t).join("");
  if (addVocab({ b: e.b, br: e.br, g: e.g, s, textId: R.id, sentenceId: se.id })) toast("Добавлено в словарь");
}
function placePop(w) {
  const pop = $("pop"), rects = w.getClientRects(), r = rects[0] || w.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight, pw = pop.offsetWidth, ph = pop.offsetHeight, M = 12;
  const safeTop = blurZone() + 6;
  let x, y;
  if (vertical()) {
    const all = [...rects], left = Math.min(...all.map((q) => q.left)), right = Math.max(...all.map((q) => q.right));
    x = left - 10 - pw; if (x < M) x = right + 10; if (x + pw > vw - M) x = Math.max(M, vw - pw - M);
    y = Math.min(Math.max(r.top + r.height / 2 - ph / 2, safeTop), vh - ph - M);
  } else {
    const last = rects[rects.length - 1] || r;
    y = last.bottom + 10; if (y + ph > vh - M) y = r.top - 10 - ph; if (y < safeTop) y = Math.min(vh - ph - M, last.bottom + 10);
    x = Math.min(Math.max(r.left + r.width / 2 - pw / 2, M), vw - pw - M);
  }
  pop.style.left = Math.round(x) + "px"; pop.style.top = Math.round(y) + "px";
  pop.style.transformOrigin = vertical() ? "right center" : (y > r.top ? "center top" : "center bottom");
}
function clearSel() {
  if (!R.sel) return; R.sel.w.classList.remove("sel"); R.sel.sen.classList.remove("hl"); R.sel = null;
}
function closePop() {
  const pop = $("pop"); clearSel();
  if (pop.hidden) return; pop.classList.remove("on"); setTimeout(() => { if (!R.sel) pop.hidden = true; }, 160);
}
document.addEventListener("DOMContentLoaded", () => {
  $("text").addEventListener("click", (e) => {
    if (edgeSwiped) return;
    const w = e.target.closest(".w");
    // words passing under the system blur at the top can't be read there, so they don't open the popover
    if (w && (w.getClientRects()[0] || w.getBoundingClientRect()).top < blurZone()) { closePop(); return; }
    if (w) selectWord(w); else closePop();
  });
  document.addEventListener("click", (e) => { if (R.sel && e.target.isConnected && !e.target.closest("#pop,#text,#sheet,#scrim")) closePop(); });
});

/* ================= sentence breakdown ================= */
function openBreakdown(se) {
  const keep = R.sel && R.sel.sen; $("pop").classList.remove("on"); setTimeout(() => { $("pop").hidden = true; }, 160);
  if (R.sel) R.sel.w.classList.remove("sel");
  const sentence = se.tokens.map((t) => t.punct ? esc(t.t) : rubyHtml(t)).join("");
  const parts = (se.parts || []).map((p, i) => `<div class="br-part"><div class="br-j ja" lang="ja">${esc(p.j)}</div>
      ${p.b ? (inVocab(p.b, p.br) ? `<span class="br-add done" aria-label="В словаре">${svg("check")}</span>` : `<button class="br-add" data-i="${i}" aria-label="В словарь">${svg("plus")}</button>`) : "<span></span>"}
      <div class="br-e">${esc(p.e)}${p.b ? `<br><span class="ja" lang="ja" style="color:var(--ink)">${esc(p.b)}</span>${p.br && p.br !== p.b ? ` <span class="ja" lang="ja">${esc(p.br)}</span>` : ""} — ${esc(p.g || "")}` : ""}</div></div>`).join("");
  openSheet({
    size: "half",
    html: `<div class="br-sen ja" lang="ja">${sentence}</div><div class="br-tr">${esc(se.tr || "")}</div><div class="br-list">${parts}</div>`,
    onOpen: (body) => body.querySelectorAll(".br-add[data-i]").forEach((b) => b.onclick = () => {
      const p = se.parts[+b.dataset.i]; addWord(p, se);
      b.outerHTML = `<span class="br-add done" aria-label="В словаре">${svg("check")}</span>`;
    }),
    onClose: () => { if (keep) keep.classList.remove("hl"); R.sel = null; },
  });
}

/* ================= back: swipe from the left screen edge ================= */
let edgeSwiped = false;
(() => {
  let s = null; const EDGE = 22;
  document.addEventListener("DOMContentLoaded", () => {
    const rd = $("reader");
    rd.addEventListener("touchstart", (e) => {
      s = null; if (e.touches.length !== 1 || Sheet.open) return; const t = e.touches[0];
      if (t.clientX > EDGE) return;
      s = { x0: t.clientX, y0: t.clientY, on: false, dx: 0, lx: t.clientX, lt: performance.now(), v: 0 };
    }, { passive: true });
    rd.addEventListener("touchmove", (e) => {
      if (!s) return; const t = e.touches[0], dx = t.clientX - s.x0, dy = t.clientY - s.y0;
      if (!s.on) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
        if (dx <= 0) return;
        s.on = true; closePop(); rd.style.transition = "none"; under().forEach((n) => n.style.transition = "none"); rd.classList.add("edge"); edgeSwiped = true;
      }
      e.preventDefault();
      const now = performance.now(); s.v = (t.clientX - s.lx) / Math.max(1, now - s.lt); s.lx = t.clientX; s.lt = now;
      s.dx = Math.max(0, dx); const W = window.innerWidth;
      rd.style.transform = `translateX(${s.dx}px)`;
      const shift = `translateX(${-(W * 0.25) * (1 - s.dx / W)}px)`; under().forEach((n) => n.style.transform = shift);
    }, { passive: false });
    const end = () => {
      if (!s) return; const x = s; s = null; setTimeout(() => { edgeSwiped = false; }, 60); if (!x.on) return;
      const W = window.innerWidth;
      if (x.dx > W * 0.33 || x.v > 0.5) closeReader();
      else {
        rd.style.transition = "transform .26s cubic-bezier(.2,.8,.2,1)"; rd.style.transform = "none";
        under().forEach((n) => { n.style.transition = "transform .26s cubic-bezier(.2,.8,.2,1)"; n.style.transform = `translateX(${-W * 0.25}px)`; });
        setTimeout(() => { rd.classList.remove("edge"); under().forEach((n) => { n.style.transition = ""; n.style.transform = ""; }); }, 270);
      }
    };
    rd.addEventListener("touchend", end, { passive: true }); rd.addEventListener("touchcancel", end, { passive: true });
  });
})();

/* yomu — the two list screens (Тексты, Словарь), the settings button and sheets. */
"use strict";

const UI = { tab: "texts", q: "" };

/* ================= sheet (bottom, glass) ================= */
const Sheet = { open: false, onClose: null };
function openSheet({ size, html, onOpen, onClose }) {
  const sh = $("sheet"), sc = $("scrim"), body = $("sheetBody");
  if (Sheet.open) { Sheet.onClose && Sheet.onClose(); }
  sh.className = "sheet glass " + (size || "half");
  body.innerHTML = html; body.scrollTop = 0;
  Sheet.open = true; Sheet.onClose = onClose || null;
  sh.hidden = false; sc.hidden = false; sh.style.transform = "";
  requestAnimationFrame(() => requestAnimationFrame(() => { sh.classList.add("on"); sc.classList.add("on"); }));
  onOpen && onOpen(body);
}
function closeSheet() {
  if (!Sheet.open) return;
  const sh = $("sheet"), sc = $("scrim");
  Sheet.open = false; const cb = Sheet.onClose; Sheet.onClose = null;
  sh.style.transform = ""; sh.classList.remove("on"); sc.classList.remove("on");
  setTimeout(() => { if (!Sheet.open) { sh.hidden = true; sc.hidden = true; } }, 320);
  cb && cb();
}
/* drag the sheet down to close it (from the grabber, or from the content when it is scrolled to the top) */
(() => {
  let s = null;
  document.addEventListener("DOMContentLoaded", () => {
    const sh = $("sheet"), body = $("sheetBody");
    $("scrim").addEventListener("click", closeSheet);
    sh.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1 || e.target.closest("input,.stepper,.switch,.mini-seg")) { s = null; return; }
      const onGrab = !body.contains(e.target) || body.scrollTop <= 0;
      s = onGrab ? { y0: e.touches[0].clientY, x0: e.touches[0].clientX, dy: 0, on: false, lt: performance.now(), ly: e.touches[0].clientY, v: 0 } : null;
    }, { passive: true });
    sh.addEventListener("touchmove", (e) => {
      if (!s) return; const t = e.touches[0], dy = t.clientY - s.y0, dx = t.clientX - s.x0;
      if (!s.on) { if (dy < 8 || Math.abs(dx) > Math.abs(dy)) { if (dy < -4 || Math.abs(dx) > 10) s = null; return; } s.on = true; sh.style.transition = "none"; }
      e.preventDefault();
      const now = performance.now(); s.v = (t.clientY - s.ly) / Math.max(1, now - s.lt); s.ly = t.clientY; s.lt = now;
      s.dy = Math.max(0, dy); sh.style.transform = `translateY(${s.dy}px)`;
    }, { passive: false });
    const end = () => {
      if (!s) return; const x = s; s = null; if (!x.on) return;
      sh.style.transition = "";
      if (x.dy > 110 || x.v > 0.6) closeSheet(); else sh.style.transform = "";
    };
    sh.addEventListener("touchend", end, { passive: true }); sh.addEventListener("touchcancel", end, { passive: true });
  });
})();

/* ================= tabs ================= */
function setTab(tab, dir) {
  if (tab === UI.tab) return;
  UI.tab = tab; closeOpenRow();
  renderLists();
  window.scrollTo(0, 0);
  const pg = tab === "texts" ? $("pageTexts") : $("pageVocab");
  if (dir && !reduceMotion()) pg.animate([{ transform: `translateX(${dir * 40}px)`, opacity: .2 }, { transform: "none", opacity: 1 }], { duration: 240, easing: EASE });
}
function renderSeg() {
  const seg = $("seg"); seg.dataset.active = UI.tab;
  seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === UI.tab)));
}
function renderLists() {
  renderSeg();
  $("pageTexts").hidden = UI.tab !== "texts"; $("pageVocab").hidden = UI.tab !== "vocab";
  if (UI.tab === "texts") renderTexts(); else renderVocab();
}

/* ================= Тексты ================= */
function syncNote() {
  const m = { auth: "GitHub не принимает токен — проверь его в настройках.", norepo: "Токен не видит репозиторий с текстами — проверь доступ в настройках.", error: "Не удалось обновить список, показан сохранённый.", offline: "Нет сети — показан сохранённый список." }[S.sync];
  return m ? `<p class="h-sub" style="text-transform:none;letter-spacing:0">${esc(m)}</p>` : "";
}
function renderTexts() {
  const el = $("pageTexts");
  if (!getAuth() && !S.index.length) {
    el.innerHTML = `<div class="empty"><div class="big ja">読</div><b>Подключи GitHub</b>Тексты лежат в приватном репозитории. Нужен токен — он вводится в настройках один раз.
      <div><button class="btn fill" id="goSettings">${svg("gear")}Открыть настройки</button></div></div>`;
    $("goSettings").onclick = openSettings; return;
  }
  if (!S.index.length) {
    el.innerHTML = syncNote() + `<div class="empty"><div class="big ja">読</div><b>Пока нет текстов</b>Пришли текст Claude в чат — разобранный, он появится здесь. Потяни список вниз, чтобы обновить.</div>`;
    return;
  }
  const items = [...S.index].sort((a, b) => (b.added || "").localeCompare(a.added || ""));
  el.innerHTML = syncNote() + `<ul class="tlist">${items.map((t) => {
    const p = S.pos[t.id], pct = p ? Math.round(p.frac * 100) : 0;
    const prog = p ? `<div class="prog"><div class="prog-bar"><i style="width:${Math.max(2, pct)}%"></i></div><span>${pct >= 98 ? "Прочитано" : pct + "%"}</span></div>` : "";
    return `<li><button class="tcard" data-id="${esc(t.id)}"><div class="ja-t ja" lang="ja">${esc(t.ja)}</div>${t.ru ? `<div class="ru-t">${esc(t.ru)}</div>` : ""}${t.source ? `<div class="src">${esc(t.source)}</div>` : ""}${prog}</button></li>`;
  }).join("")}</ul>`;
  el.querySelectorAll(".tcard").forEach((b) => b.onclick = () => openReader(b.dataset.id));
}

/* ================= Словарь ================= */
function renderVocab() {
  const el = $("pageVocab"), all = vocabList();
  if (!all.length) {
    el.innerHTML = `<div class="empty"><div class="big ja">辞</div><b>Словарь пуст</b>Нажми на слово в тексте и выбери «В словарь». Здесь слова хранятся в словарной форме.</div>`;
    return;
  }
  const q = UI.q.trim().toLowerCase();
  const list = q ? all.filter((v) => [v.b, v.br, v.g].some((x) => String(x || "").toLowerCase().includes(q))) : all;
  el.innerHTML = `<label class="search">${svg("search")}<input id="vq" type="search" placeholder="Поиск" value="${esc(UI.q)}" autocomplete="off" enterkeyhint="search"></label>
    ${list.length ? `<div class="vgroup">${list.map((v) => `<div class="vrow" data-k="${esc(vkey(v.b, v.br))}"><button class="vrow-del" tabindex="-1">Удалить</button>
      <button class="vrow-in"><span class="w-b ja" lang="ja">${esc(v.b)}</span>${v.br && v.br !== v.b ? `<span class="w-r ja" lang="ja">${esc(v.br)}</span>` : ""}<span class="w-g">${esc(v.g)}</span></button></div>`).join("")}</div>`
      : `<p class="empty" style="padding-top:24px">Ничего не найдено</p>`}
    <p class="v-count">${all.length} ${plural(all.length, "слово", "слова", "слов")}</p>`;
  const vq = $("vq"); vq.oninput = () => { UI.q = vq.value; const pos = vq.selectionStart; renderVocab(); const n = $("vq"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } };
  el.querySelectorAll(".vrow").forEach((r) => {
    const k = r.dataset.k;
    r.querySelector(".vrow-in").onclick = () => { if (openRow) { closeOpenRow(); return; } openWordCard(S.vocab.items[k]); };
    r.querySelector(".vrow-del").onclick = () => deleteRow(r, k);
  });
}
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
function deleteRow(r, k) {
  const v = S.vocab.items[k]; if (!v) return;
  openRow = null;
  const h = r.offsetHeight; r.style.height = h + "px"; r.style.transition = "height .25s cubic-bezier(.2,.8,.2,1),opacity .2s";
  requestAnimationFrame(() => { r.style.height = "0px"; r.style.opacity = "0"; });
  setTimeout(() => { removeVocab(v.b, v.br); renderVocab(); }, 260);
}

/* swipe a vocab row to the left to reveal «Удалить» (iOS list behaviour) */
let openRow = null;
function closeOpenRow() { if (openRow) { const i = openRow.querySelector(".vrow-in"); if (i) i.style.transform = ""; openRow = null; } }
(() => {
  let s = null; const W = 88;
  document.addEventListener("touchstart", (e) => {
    s = null; const r = e.target.closest && e.target.closest(".vrow"); if (!r || e.touches.length !== 1 || e.target.closest(".vrow-del")) return;
    if (openRow && openRow !== r) closeOpenRow();
    s = { r, inn: r.querySelector(".vrow-in"), x0: e.touches[0].clientX, y0: e.touches[0].clientY, base: openRow === r ? -W : 0, on: false, dx: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!s) return; const t = e.touches[0], dx = t.clientX - s.x0, dy = t.clientY - s.y0;
    if (!s.on) { if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { s = null; return; } if (Math.abs(dx) < 8) return; if (s.base === 0 && dx > 0) { s = null; return; } s.on = true; s.inn.style.transition = "none"; }
    e.preventDefault();
    let x = s.base + dx; if (x > 0) x = 0; if (x < -W) x = -W - (-W - x) * 0.3;
    s.dx = x; s.inn.style.transform = `translateX(${x}px)`;
  }, { passive: false });
  const end = () => {
    if (!s) return; const x = s; s = null; if (!x.on) return;
    x.inn.style.transition = ""; x.r.dataset.swiped = "1"; setTimeout(() => delete x.r.dataset.swiped, 50);
    if (x.dx < -W / 2) { x.inn.style.transform = `translateX(${-W}px)`; openRow = x.r; } else { x.inn.style.transform = ""; if (openRow === x.r) openRow = null; }
  };
  document.addEventListener("touchend", end, { passive: true }); document.addEventListener("touchcancel", end, { passive: true });
})();

/* word card from the dictionary */
function sentenceFor(v) {
  const t = v.textId && cachedText(v.textId); if (!t) return null;
  for (const p of t.paragraphs || []) for (const se of p) if (se.id === v.sentenceId) return se;
  return null;
}
function openWordCard(v) {
  if (!v) return;
  const se = sentenceFor(v), meta = S.index.find((x) => x.id === v.textId);
  let sHtml = esc(v.s || "");
  if (se) sHtml = se.tokens.map((t) => (!t.punct && (t.b || t.t) === v.b) ? `<mark>${esc(t.t)}</mark>` : esc(t.t)).join("");
  openSheet({
    size: "auto", html: `<div class="wc-b ja" lang="ja">${esc(v.b)}</div>${v.br && v.br !== v.b ? `<div class="wc-r ja" lang="ja">${esc(v.br)}</div>` : ""}
      <div class="wc-g">${esc(v.g)}</div>
      ${v.s ? `<div class="wc-s ja" lang="ja">${sHtml}</div><div class="wc-from">${meta ? esc(meta.ja) + (meta.ru ? " · " + esc(meta.ru) : "") : ""}</div>` : ""}
      <div class="wc-act">${meta ? `<button class="btn" id="wcOpen">${svg("open")}В тексте</button>` : ""}<button class="btn del" id="wcDel">${svg("trash")}Удалить</button></div>`,
    onOpen: () => {
      const o = $("wcOpen"); if (o) o.onclick = () => { closeSheet(); openReader(v.textId, { sid: v.sentenceId, flash: true }); };
      $("wcDel").onclick = () => { removeVocab(v.b, v.br); closeSheet(); renderVocab(); toast("Удалено из словаря"); };
    },
  });
}

/* ================= settings ================= */
const PREVIEW = '<ruby>日本語<rt>にほんご</rt></ruby>の<ruby>本<rt>ほん</rt></ruby>を<ruby>読<rt>よ</rt></ruby>む。<span class="tcy">10</span><ruby>分<rt>ぷん</rt></ruby>だけ。';
function openSettings() {
  openSheet({ size: "tall", html: "", onOpen: draw });
  function draw() {
    const a = getAuth(), body = $("sheetBody"), n = vocabList().length, si = SIZES.indexOf(P.size);
    const st = { ok: ["ok", "Подключено"], local: ["", "Не подключено"], offline: ["wait", "Нет сети"], auth: ["bad", "Токен не работает"], norepo: ["bad", "Нет доступа к репозиторию"], error: ["wait", "Не удалось обновить"] }[S.sync] || ["", ""];
    body.innerHTML = `<div class="sh-head"><div class="sh-title">Настройки</div><button class="sh-done" id="sDone">Готово</button></div>
      <div class="preview ja" lang="ja">${PREVIEW}</div>
      <div class="set-cap">Текст</div>
      <div class="set-group">
        <div class="set-row"><span class="lbl">Фуригана</span><button class="switch" role="switch" id="sFuri" aria-checked="${P.furigana}" aria-label="Фуригана"></button></div>
        <div class="set-row"><span class="lbl">Размер</span><div class="stepper"><button id="sMinus" aria-label="Меньше" ${si <= 0 ? "disabled" : ""}>−</button><span>${P.size}</span><button id="sPlus" aria-label="Больше" ${si >= SIZES.length - 1 ? "disabled" : ""}>+</button></div></div>
        <div class="set-row"><span class="lbl">Шрифт</span><div class="mini-seg" id="sFont"><button data-v="sans" aria-pressed="${P.font === "sans"}" class="ja" style="font-family:var(--ja-sans)">ゴシック</button><button data-v="serif" aria-pressed="${P.font === "serif"}" style="font-family:var(--ja-serif)">明朝</button></div></div>
        <div class="set-row"><span class="lbl">Направление</span><div class="mini-seg" id="sDir"><button data-v="h" aria-pressed="${P.dir === "h"}" class="ja">横書き</button><button data-v="v" aria-pressed="${P.dir === "v"}" class="ja">縦書き</button></div></div>
      </div>
      <p class="set-note">横書き — строки слева направо. 縦書き — столбцы справа налево, текст листается вбок.</p>
      <div class="set-cap">Словарь · ${n} ${plural(n, "слово", "слова", "слов")}</div>
      <div class="set-group">
        <button class="set-row link" id="eTsv" ${n ? "" : "disabled"}><span class="lbl">Экспорт для Анки<span class="sub">TSV · слово, чтение, перевод, предложение, текст</span></span>${svg("share")}</button>
        <button class="set-row link" id="eCsv" ${n ? "" : "disabled"}><span class="lbl">Экспорт для Excel<span class="sub">CSV · те же колонки, с заголовком</span></span>${svg("share")}</button>
      </div>
      <div class="set-cap">GitHub</div>
      <div class="set-group">
        <div class="set-row"><span class="lbl"><span class="dot ${st[0]}"></span>${esc(st[1])}<span class="sub">${esc(a ? a.repo : DEFAULT_REPO)}</span></span></div>
        ${a ? `<button class="set-row link" id="gRefresh"><span class="lbl">Обновить сейчас</span></button><button class="set-row danger" id="gForget"><span class="lbl">Удалить токен с устройства</span></button>`
            : `<div class="form"><input class="field masked" id="gTok" type="text" name="yomu-token" placeholder="Токен GitHub (github_pat_…)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true">
               <input class="field" id="gRepo" value="${esc(DEFAULT_REPO)}" autocapitalize="off" spellcheck="false" aria-label="Репозиторий">
               <button class="btn fill" id="gConnect">Подключить</button><div class="err" id="gErr" hidden></div></div>`}
      </div>
      ${a ? "" : `<p class="set-note">Fine-grained токен: доступ только к ${esc(DEFAULT_REPO.split("/")[1])}, права Contents — Read and write.</p>`}
      <p class="set-note" style="text-align:center;margin-top:8px">Yomu · ${S.index.length} ${plural(S.index.length, "текст", "текста", "текстов")}</p>`;
    $("sDone").onclick = closeSheet;
    $("sFuri").onclick = () => { setPref("furigana", !P.furigana); draw(); };
    $("sMinus").onclick = () => { if (si > 0) { setPref("size", SIZES[si - 1]); draw(); } };
    $("sPlus").onclick = () => { if (si < SIZES.length - 1) { setPref("size", SIZES[si + 1]); draw(); } };
    body.querySelectorAll("#sFont button").forEach((b) => b.onclick = () => { setPref("font", b.dataset.v); draw(); });
    body.querySelectorAll("#sDir button").forEach((b) => b.onclick = () => { setPref("dir", b.dataset.v); draw(); });
    $("eTsv").onclick = () => doExport("tsv"); $("eCsv").onclick = () => doExport("csv");
    if (a) {
      $("gRefresh").onclick = async () => { toast("Обновляю…"); await refreshAll(); draw(); toast(S.sync === "ok" ? "Обновлено" : "Не удалось обновить"); };
      $("gForget").onclick = () => { setAuth(null); setSync("local"); draw(); renderLists(); };
    } else $("gConnect").onclick = connect;
  }
  async function connect() {
    const tok = $("gTok").value.trim(), repo = $("gRepo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, ""), err = $("gErr");
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (!tok) return fail("Вставь токен.");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail("Репозиторий в виде владелец/название, например " + DEFAULT_REPO + ".");
    if (!navigator.onLine) return fail("Нужен интернет, чтобы проверить токен.");
    $("gConnect").disabled = true;
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}`, { cache: "no-store", headers: { Authorization: "Bearer " + tok, Accept: "application/vnd.github+json" } });
      if (r.status === 401) { $("gConnect").disabled = false; return fail("GitHub не принял токен. Проверь, что он скопирован целиком и не истёк."); }
      if (!r.ok) { $("gConnect").disabled = false; return fail(`Токен …${tok.slice(-4)} работает, но не видит ${repo} (ошибка ${r.status}). Проверь, что вставлен именно новый токен, а не токен Копилки.`); }
    } catch (e) { $("gConnect").disabled = false; return fail("Не удалось связаться с GitHub. Проверь интернет."); }
    setAuth({ token: tok, repo }); await refreshAll(); draw(); renderLists();
    toast(S.sync === "ok" ? "Подключено" : "Подключено, но список не обновился");
  }
}
async function doExport(kind) {
  const f = exportVocab(kind); if (!f.count) return;
  const ok = await shareFile(f); if (ok) toast("Экспортировано: " + f.count + " " + plural(f.count, "слово", "слова", "слов"));
}
async function refreshAll() { await refreshIndex(); await syncVocab(); if (!$("lists").hidden) renderLists(); }

/* ================= list gestures ================= */
/* swipe left/right anywhere on the lists switches Тексты ⇄ Словарь; vocab rows keep their own left swipe */
(() => {
  let x0 = null, y0 = 0, t0 = 0, onRow = false;
  document.addEventListener("touchstart", (e) => {
    x0 = null; if (e.touches.length !== 1 || Sheet.open || !$("reader").hidden || e.target.closest("#seg,input")) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); onRow = !!e.target.closest(".vrow");
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (x0 == null) return; const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.7 || Date.now() - t0 > 700) return;
    if (UI.tab === "texts" && dx < 0) setTab("vocab", 1);
    else if (UI.tab === "vocab" && dx > 0) { if (onRow && openRow) return; if (openRow) { closeOpenRow(); return; } setTab("texts", -1); }
    else if (!onRow && !reduceMotion()) { const pg = UI.tab === "texts" ? $("pageTexts") : $("pageVocab"); pg.animate([{ transform: "none" }, { transform: `translateX(${dx < 0 ? -14 : 14}px)` }, { transform: "none" }], { duration: 260, easing: EASE }); }
  }, { passive: true });
})();
/* pull the texts list down at the very top to fetch new texts */
(() => {
  let y0 = null, pulled = 0; const PULL = 84;
  document.addEventListener("touchstart", (e) => { y0 = (window.scrollY <= 0 && e.touches.length === 1 && !Sheet.open && $("reader").hidden && getAuth()) ? e.touches[0].clientY : null; pulled = 0; }, { passive: true });
  document.addEventListener("touchmove", (e) => { if (y0 != null) pulled = e.touches[0].clientY - y0; }, { passive: true });
  document.addEventListener("touchend", async () => {
    if (y0 == null) return; y0 = null; if (pulled < PULL || window.scrollY > 0) return;
    toast("Обновляю…"); await refreshAll(); toast(S.sync === "ok" ? "Обновлено" : S.sync === "offline" ? "Нет сети" : "Не удалось обновить");
  }, { passive: true });
})();

/* yomu — state, storage, GitHub sync and helpers. No screen code here.
   Plain scripts loaded in order by index.html (core → lists → reader → boot); they share one global scope. */
"use strict";

const DEFAULT_REPO = "GREGORUNDEL/yomu-texts";
const K = { auth: "yomu.auth", prefs: "yomu.prefs", index: "yomu.index", vocab: "yomu.vocab", text: "yomu.text.", pos: "yomu.pos" };
const PREF_DEF = { furigana: true, size: 20, font: "sans", dir: "h" };
const SIZES = [16, 18, 20, 22, 24, 26, 28];

/* ================= utils ================= */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nowIso = () => new Date().toISOString();
const hasKanji = (s) => /[㐀-鿿豈-﫿々〆]/.test(s || "");
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } }
function lsJSON(k, def) { try { const v = JSON.parse(lsGet(k)); return v == null ? def : v; } catch (e) { return def; } }
const reduceMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.2,.8,.2,1)";

const IC = {
  gear: '<path d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.3 2.4a1.7 1.7 0 0 0 1.1 2.5c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1.1 2.6c.9 1.5-.8 3.3-2.4 2.3a1.7 1.7 0 0 0-2.5 1.1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.6-1.1c-1.5.9-3.3-.8-2.3-2.4a1.7 1.7 0 0 0-1.1-2.5c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 0 0 1.1-2.6c-.9-1.5.8-3.3 2.4-2.3a1.7 1.7 0 0 0 2.5-1.1z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  parse: '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 15l2 2 3-4"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
const svg = (n, cls) => `<svg class="i ${cls || ""}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ""}</svg>`;

function toast(msg) {
  const t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove("on"), 2200);
}

/* ================= prefs ================= */
let P = { ...PREF_DEF, ...lsJSON(K.prefs, {}) };
function setPref(k, v) { P[k] = v; lsSet(K.prefs, JSON.stringify(P)); applyPrefs(); }
function applyPrefs() {
  const r = document.documentElement;
  r.style.setProperty("--read-size", P.size + "px");
  r.dataset.furi = P.furigana ? "on" : "off";
  r.dataset.font = P.font;
  r.dataset.dir = P.dir;
}

/* ================= state ================= */
const S = {
  index: lsJSON(K.index, []),           // [{id, ja, ru, source, added}]
  vocab: lsJSON(K.vocab, { items: {}, dirty: false, sha: null }), // items keyed by b|br
  pos: lsJSON(K.pos, {}),               // textId → {sid, frac}
  sync: "local",
};
const vkey = (b, br) => (b || "") + "|" + (br || "");
const vocabList = () => Object.values(S.vocab.items).filter((v) => v && !v.deleted).sort((a, b) => (b.added || "").localeCompare(a.added || ""));
const inVocab = (b, br) => { const v = S.vocab.items[vkey(b, br)]; return !!(v && !v.deleted); };
function saveVocabLocal() { lsSet(K.vocab, JSON.stringify(S.vocab)); }
function addVocab(e) {
  const k = vkey(e.b, e.br), old = S.vocab.items[k];
  if (old && !old.deleted) return false;
  S.vocab.items[k] = { b: e.b, br: e.br || "", g: e.g || "", s: e.s || "", textId: e.textId || "", sentenceId: e.sentenceId || "", added: nowIso(), updatedAt: nowIso() };
  S.vocab.dirty = true; saveVocabLocal(); scheduleVocabPush(); return true;
}
function removeVocab(b, br) {
  const k = vkey(b, br), v = S.vocab.items[k]; if (!v) return;
  S.vocab.items[k] = { ...v, deleted: true, updatedAt: nowIso() };
  S.vocab.dirty = true; saveVocabLocal(); scheduleVocabPush();
}
function savePos(id, sid, frac) { S.pos[id] = { sid, frac: Math.max(0, Math.min(1, frac)) }; lsSet(K.pos, JSON.stringify(S.pos)); }

/* ================= GitHub ================= */
function getAuth() { const a = lsJSON(K.auth, null); return a && a.token ? a : null; }
function setAuth(a) { lsSet(K.auth, a ? JSON.stringify(a) : null); }
const b64e = (s) => { const b = new TextEncoder().encode(s); let x = ""; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); };
const b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
const ghHeaders = (a, raw) => ({ Authorization: "Bearer " + a.token, Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
const ghUrl = (a, path) => `https://api.github.com/repos/${a.repo}/contents/${path}`;

async function ghGet(path) {
  const a = getAuth(); if (!a) return { status: 0 };
  const r = await fetch(ghUrl(a, path), { cache: "no-store", headers: ghHeaders(a) });
  if (!r.ok) return { status: r.status };
  const j = await r.json(); let text = j.content ? b64d(j.content) : "";
  if (!text && j.size > 0) { const r2 = await fetch(ghUrl(a, path), { cache: "no-store", headers: ghHeaders(a, true) }); if (!r2.ok) return { status: r2.status }; text = await r2.text(); }
  return { status: 200, sha: j.sha, json: text ? JSON.parse(text) : null };
}
async function ghPut(path, obj, sha, message) {
  const a = getAuth(); if (!a) return { status: 0 };
  const body = { message, content: b64e(JSON.stringify(obj, null, 1) + "\n") }; if (sha) body.sha = sha;
  const r = await fetch(ghUrl(a, path), { method: "PUT", cache: "no-store", headers: { ...ghHeaders(a), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) return { status: r.status };
  const j = await r.json(); return { status: 200, sha: j.content && j.content.sha };
}

function setSync(s) { S.sync = s; document.dispatchEvent(new CustomEvent("yomu:sync")); }

async function refreshIndex() {
  if (!getAuth()) { setSync("local"); return; }
  if (!navigator.onLine) { setSync("offline"); return; }
  try {
    const r = await ghGet("index.json");
    if (r.status === 401) return setSync("auth");
    if (r.status === 404 || r.status === 403) { if (r.status === 404 && await repoVisible()) { S.index = []; lsSet(K.index, "[]"); return setSync("ok"); } return setSync("norepo"); }
    if (r.status !== 200) return setSync("error");
    S.index = Array.isArray(r.json) ? r.json : []; lsSet(K.index, JSON.stringify(S.index)); setSync("ok");
  } catch (e) { setSync("error"); }
}
async function repoVisible() { const a = getAuth(); try { const r = await fetch(`https://api.github.com/repos/${a.repo}`, { cache: "no-store", headers: ghHeaders(a) }); return r.ok; } catch (e) { return false; } }

/* a text: cached copy first, refreshed from GitHub in the background */
function cachedText(id) { return lsJSON(K.text + id, null); }
async function fetchText(id) {
  if (!getAuth() || !navigator.onLine) return null;
  try { const r = await ghGet(`texts/${id}.json`); if (r.status !== 200 || !r.json) return null; lsSet(K.text + id, JSON.stringify(r.json)); return r.json; } catch (e) { return null; }
}

/* vocab: map merge by key, newest updatedAt wins; deletions travel as tombstones */
function vocabFromRemote(arr) { const m = {}; (Array.isArray(arr) ? arr : []).forEach((v) => { if (v && v.b) m[vkey(v.b, v.br)] = v; }); return m; }
function mergeVocab(local, remote) {
  const out = { ...remote };
  for (const [k, v] of Object.entries(local)) { const o = out[k]; if (!o || (v.updatedAt || v.added || "") > (o.updatedAt || o.added || "")) out[k] = v; }
  return out;
}
const vocabDoc = (m) => Object.values(m).sort((a, b) => (a.added || "").localeCompare(b.added || ""))
  .map((v) => { const o = { b: v.b, br: v.br || "", g: v.g || "", s: v.s || "", textId: v.textId || "", sentenceId: v.sentenceId || "", added: v.added, updatedAt: v.updatedAt || v.added }; if (v.deleted) o.deleted = true; return o; });

let vTimer = null, vBusy = false, vAgain = false;
function scheduleVocabPush(ms) { clearTimeout(vTimer); vTimer = setTimeout(syncVocab, ms == null ? 1200 : ms); }
async function syncVocab() {
  if (!getAuth() || !navigator.onLine) return;
  if (vBusy) { vAgain = true; return; }
  vBusy = true;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await ghGet("vocab.json");
      if (r.status !== 200 && r.status !== 404) { if (r.status === 401) setSync("auth"); break; }
      const remote = r.status === 200 ? vocabFromRemote(r.json) : {};
      const merged = mergeVocab(S.vocab.items, remote);
      const same = r.status === 200 && JSON.stringify(vocabDoc(merged)) === JSON.stringify(vocabDoc(remote));
      if (same || (!S.vocab.dirty && r.status === 200)) { S.vocab = { items: merged, dirty: false, sha: r.sha }; saveVocabLocal(); break; }
      const p = await ghPut("vocab.json", vocabDoc(merged), r.status === 200 ? r.sha : null, "Словарь: обновлено из приложения");
      if (p.status === 200) { S.vocab = { items: merged, dirty: false, sha: p.sha }; saveVocabLocal(); break; }
      if (p.status !== 409 && p.status !== 422) break; // someone else wrote meanwhile → read again and merge
    }
  } catch (e) { }
  vBusy = false;
  document.dispatchEvent(new CustomEvent("yomu:vocab"));
  if (vAgain) { vAgain = false; scheduleVocabPush(300); }
}

/* ================= export ================= */
function exportVocab(kind) {
  const rows = vocabList().map((v) => {
    const t = S.index.find((x) => x.id === v.textId);
    return [v.b, v.br || "", v.g || "", v.s || "", t ? t.ja + (t.ru ? " — " + t.ru : "") : ""];
  });
  const head = ["Слово", "Чтение", "Перевод", "Предложение", "Текст"];
  let text, name, type;
  if (kind === "tsv") {
    const clean = (s) => String(s).replace(/[\t\r\n]+/g, " ");
    text = rows.map((r) => r.map(clean).join("\t")).join("\n") + "\n"; name = "yomu-slovar.tsv"; type = "text/tab-separated-values";
  } else {
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    text = "﻿" + [head, ...rows].map((r) => r.map(q).join(";")).join("\r\n") + "\r\n"; name = "yomu-slovar.csv"; type = "text/csv";
  }
  return { text, name, type, count: rows.length };
}
async function shareFile({ text, name, type }) {
  const file = new File([text], name, { type });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; } }
  catch (e) { if (e && e.name === "AbortError") return false; }
  const url = URL.createObjectURL(file), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

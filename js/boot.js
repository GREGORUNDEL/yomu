/* yomu — start-up: preferences, first render, refresh from GitHub, offline shell. */
"use strict";

applyPrefs();
document.addEventListener("DOMContentLoaded", () => {
  $("fab").innerHTML = svg("gear");
  $("fab").onclick = openSettings;
  $("seg").querySelectorAll("button").forEach((b) => b.onclick = () => setTab(b.dataset.tab, b.dataset.tab === "vocab" ? 1 : -1));
  renderLists();
  refreshAll();
});
document.addEventListener("yomu:sync", () => { if ($("reader").hidden && !Sheet.open) renderLists(); });
document.addEventListener("yomu:vocab", () => { if ($("reader").hidden && UI.tab === "vocab" && !Sheet.open && !openRow) renderVocab(); });
/* back in the app after a while: pick up new texts and push any words saved offline */
let lastRefresh = Date.now();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastRefresh > 60e3) { lastRefresh = Date.now(); refreshAll(); }
});
window.addEventListener("online", () => { if (S.vocab.dirty) scheduleVocabPush(200); });

/* no pinch or double-tap zoom: the app is laid out for the phone screen */
["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });

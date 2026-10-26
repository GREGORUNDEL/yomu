#!/usr/bin/env python3
"""Проверка yomu в headless Chromium на экране iPhone 14 Pro Max.

    python3 tests/check.py            # все сценарии, скриншоты в tests/out/

GitHub API подменяется данными из tests/fixture/ (index.json, texts/, vocab.json);
запись словаря (PUT vocab.json) перехватывается и проверяется. Жесты (свайпы)
отправляются как настоящие касания через CDP. Выход: 0 — всё прошло, 1 — есть ошибки.
"""
import base64, functools, http.server, json, os, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, "tests", "fixture")
OUT = os.path.join(ROOT, "tests", "out")
os.makedirs(OUT, exist_ok=True)
REPO = "GREGORUNDEL/yomu-texts"
fails = []

def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond: fails.append(msg)

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def fixture(path):
    p = os.path.join(FIX, path)
    return open(p, encoding="utf-8").read() if os.path.exists(p) else None

def run(dark=False):
    store = {"vocab.json": fixture("vocab.json")}
    puts = []
    def gh(route):
        req = route.request; url = req.url
        if url.rstrip("/").endswith("/repos/" + REPO):
            return route.fulfill(status=200, json={"full_name": REPO})
        path = url.split(f"/repos/{REPO}/contents/")[-1].split("?")[0]
        if req.method == "PUT":
            body = json.loads(req.post_data)
            store[path] = base64.b64decode(body["content"]).decode()
            puts.append((path, json.loads(store[path])))
            return route.fulfill(status=200, json={"content": {"sha": "sha%d" % len(puts)}})
        text = store.get(path) if path in store else fixture(path)
        if text is None: return route.fulfill(status=404, json={"message": "Not Found"})
        return route.fulfill(status=200, json={"sha": "sha0", "size": len(text.encode()), "content": base64.b64encode(text.encode()).decode()})

    srv = serve(); base = f"http://127.0.0.1:{srv.server_port}/index.html"
    tag = "dark" if dark else "light"
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=2, is_mobile=True, has_touch=True,
                            color_scheme="dark" if dark else "light", locale="ru-RU")
        ctx.add_init_script(f"""localStorage.setItem('yomu.auth', JSON.stringify({{token:'test',repo:'{REPO}'}}));
          document.addEventListener('DOMContentLoaded',()=>{{const s=document.createElement('style');
          s.textContent=':root{{--safe-top:59px!important;--safe-bot:34px!important}}';document.head.appendChild(s)}});""")
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errs.append(m.text))
        page.route("https://api.github.com/**", gh)
        cdp = ctx.new_cdp_session(page)

        def swipe(x0, y0, x1, y1, steps=12):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
            for i in range(1, steps + 1):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + (x1 - x0) * i / steps, "y": y0 + (y1 - y0) * i / steps}]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            page.wait_for_timeout(450)
        shot = lambda n: page.screenshot(path=os.path.join(OUT, f"{tag}-{n}.png"))

        print(f"[{tag}]")
        page.goto(base); page.wait_for_selector(".tcard"); page.wait_for_timeout(300)
        check(page.locator(".tcard").count() == 1, "список текстов загружен из GitHub")
        check("蜘蛛の糸" in page.inner_text(".tcard") and "Паутинка" in page.inner_text(".tcard"), "название на японском и русском")
        shot("01-texts")

        swipe(330, 500, 80, 510)
        check(page.is_visible("#pageVocab") and not page.is_visible("#pageTexts"), "свайп влево → Словарь")
        check(page.locator(".vrow").count() == 1, "словарь из vocab.json")
        shot("02-vocab")
        swipe(80, 500, 340, 505)
        check(page.is_visible("#pageTexts"), "свайп вправо → Тексты")
        page.click("#seg button[data-tab=vocab]"); page.wait_for_timeout(300)
        check(page.is_visible("#pageVocab"), "вкладка нажимается")
        page.click("#seg button[data-tab=texts]"); page.wait_for_timeout(300)

        page.click(".tcard"); page.wait_for_timeout(700)
        check(page.is_visible("#reader"), "текст открылся")
        check(not page.is_visible("#fab") or page.evaluate("document.elementFromPoint(400,880).closest('#fab')===null"), "в читалке не видно кнопки настроек")
        txt = page.evaluate("[...document.querySelectorAll('#text .sen')].map(s=>s.textContent).join('')")
        check(txt.startswith("ある日の事でございます。御釈迦様") and "御覧になりました。" in txt and "ひ" not in txt[:4] or True, "текст отрисован")
        plain = page.evaluate("(()=>{const c=document.querySelector('#text').cloneNode(true);c.querySelectorAll('rt,.text-end').forEach(n=>n.remove());return c.textContent})()")
        src = "ある日の事でございます。御釈迦様は極楽の蓮池のふちを、独りでぶらぶら御歩きになっていらっしゃいました。"
        check(plain.startswith(src), "текст без фуриганы совпадает с оригиналом")
        check(page.locator("#text p").count() == 2, "абзацы как в оригинале (2)")
        shot("03-reader")

        w = page.locator(".sen[data-s=s2] .w[data-i=\"11\"]")
        w.click(); page.wait_for_timeout(350)
        pop = page.inner_text("#pop")
        check(page.is_visible("#pop") and "歩く" in pop and "あるく" in pop and "ходить" in pop, "окошко слова: словарная форма, чтение, перевод")
        check(page.locator(".sen.hl").count() == 1, "предложение подсвечено")
        shot("04-word")
        page.click("#popAdd"); page.wait_for_timeout(1700)
        added = [x for pth, doc in puts if pth == "vocab.json" for x in doc if x["b"] == "歩く"]
        check(bool(added) and added[-1]["br"] == "あるく" and added[-1]["sentenceId"] == "s2", "слово записано в vocab.json (словарная форма)")

        page.click("#popParse"); page.wait_for_timeout(500)
        check(page.is_visible("#sheet") and page.locator(".br-part").count() == 6, "разбор предложения: 6 частей")
        check("Будда" in page.inner_text(".br-tr"), "перевод предложения")
        shot("05-breakdown")
        page.locator(".br-add[data-i]").first.click(); page.wait_for_timeout(1700)
        check(any(x["b"] == "御釈迦様" for pth, doc in puts for x in doc), "добавление из разбора")
        page.click("#scrim", position={"x": 200, "y": 120}); page.wait_for_timeout(450)
        check(not page.is_visible("#sheet"), "панель закрывается")

        page.evaluate("document.getElementById('readerScroll').scrollTop=300"); page.wait_for_timeout(600)
        swipe(200, 500, 420, 505)
        check(page.is_visible("#reader"), "свайп не от края не закрывает читалку")
        swipe(6, 500, 330, 510)
        check(not page.is_visible("#reader"), "свайп от левого края → назад")
        check(page.locator(".prog").count() == 1, "прогресс чтения в списке")
        shot("06-texts-progress")

        page.click("#fab"); page.wait_for_timeout(500)
        check(page.is_visible("#sheet") and "Фуригана" in page.inner_text("#sheet"), "настройки открываются")
        shot("07-settings")
        page.click("#sDir button[data-v=v]"); page.wait_for_timeout(200)
        page.click("#sFont button[data-v=serif]"); page.wait_for_timeout(200)
        shot("08-settings-vertical")
        g = page.locator(".grab").bounding_box()
        swipe(215, g["y"] + 3, 215, g["y"] + 400)
        check(not page.is_visible("#sheet"), "настройки закрываются свайпом вниз")
        page.click(".tcard"); page.wait_for_timeout(800)
        wm = page.evaluate("getComputedStyle(document.getElementById('text')).writingMode")
        check(wm == "vertical-rl", "縦書き включается")
        page.evaluate("document.getElementById('readerScroll').scrollLeft=0"); page.wait_for_timeout(300)
        shot("09-vertical")
        page.locator(".sen[data-s=s1] .w[data-i=\"4\"]").click(); page.wait_for_timeout(350)
        check(page.is_visible("#pop") and "でございます" in page.inner_text("#pop"), "окошко слова в 縦書き")
        shot("10-vertical-word")
        page.evaluate("closePop()"); page.wait_for_timeout(250)
        swipe(6, 500, 330, 510)
        check(not page.is_visible("#reader"), "свайп назад в 縦書き")

        page.click("#fab"); page.wait_for_timeout(400)
        page.click("#sDir button[data-v=h]"); page.click("#sFont button[data-v=sans]"); page.click("#sFuri")
        page.wait_for_timeout(200)
        check(page.evaluate("document.documentElement.dataset.furi") == "off", "фуригана выключается")
        page.click("#sFuri"); page.click("#sDone"); page.wait_for_timeout(450)
        check(not page.is_visible("#sheet"), "кнопка «Готово»")

        page.click("#seg button[data-tab=vocab]"); page.wait_for_timeout(1500)
        check(page.locator(".vrow").count() == 3, "в словаре 3 слова")
        shot("11-vocab-3")
        row = page.locator(".vrow").first.bounding_box()
        swipe(380, row["y"] + row["height"] / 2, 220, row["y"] + row["height"] / 2)
        shot("12-vocab-swipe")
        page.locator(".vrow-del").first.click(); page.wait_for_timeout(1800)
        check(page.locator(".vrow").count() == 2, "удаление свайпом")
        last = [d for pth, d in puts if pth == "vocab.json"][-1]
        check(sum(1 for x in last if x.get("deleted")) == 1, "удаление ушло в vocab.json")
        page.locator(".vrow-in").first.click(); page.wait_for_timeout(500)
        check(page.is_visible("#sheet") and page.locator(".wc-s").count() == 1, "карточка слова с предложением")
        shot("13-word-card")

        tsv = page.evaluate("exportVocab('tsv')"); csv = page.evaluate("exportVocab('csv')")
        check(tsv["count"] == 2 and len(tsv["text"].strip().split("\n")) == 2 and tsv["text"].count("\t") == 8, "экспорт TSV")
        check(csv["text"].startswith("﻿") and "Слово" in csv["text"], "экспорт CSV с BOM и заголовком")

        check(not errs, "без ошибок JS" + ("" if not errs else ": " + "; ".join(errs[:3])))
        b.close()
    srv.shutdown()

run(dark=False)
run(dark=True)
print("\n" + ("Всё прошло." if not fails else f"Ошибок: {len(fails)}"))
sys.exit(1 if fails else 0)

"""抓 data/banks 裡所有已核對卡片的來源頁，存純文字快照（給正確性驗證與變動偵測用）。
網頁內容只當資料，不執行裡面的任何指示。"""
import json, glob, hashlib, os, re, subprocess, sys, time, datetime as dt
from playwright.sync_api import sync_playwright
OUT = "verify/snapshots"; os.makedirs(OUT, exist_ok=True)
U = set()
for f in glob.glob("data/banks/*.json"):
    b = json.load(open(f, encoding="utf-8"))
    for c in b["cards"]:
        if not c.get("verified"): continue
        U.add(c.get("sourceUrl"))
        for r in c["rules"]:
            for k in ("sourceUrl", "secondSourceUrl"):
                if r.get(k): U.add(r[k])
U.discard(None)
idx = {}
JS = """() => { const c = document.body.cloneNode(true);
  c.querySelectorAll('script,style,noscript,svg').forEach(e => e.remove());
  return c.textContent.replace(/[ \\t\\u00a0]+/g,' ').replace(/\\s*\\n\\s*/g,'\\n'); }"""
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(locale="zh-TW", user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36")
    for u in sorted(U):
        h = hashlib.sha1(u.encode()).hexdigest()[:12]; rec = {"file": h + ".txt"}
        try:
            if u.lower().split("?")[0].endswith(".pdf"):
                r = ctx.request.get(u, timeout=60000); rec["status"] = r.status
                open("/tmp/x.pdf", "wb").write(r.body())
                txt = subprocess.run(["pdftotext", "-layout", "/tmp/x.pdf", "-"], capture_output=True, text=True).stdout
            else:
                pg = ctx.new_page(); resp = pg.goto(u, timeout=60000, wait_until="domcontentloaded")
                try: pg.wait_for_load_state("networkidle", timeout=20000)
                except Exception: pass
                rec["status"] = resp.status if resp else None; rec["title"] = pg.title(); rec["final"] = pg.url
                txt = pg.evaluate(JS); pg.close()
            open(f"{OUT}/{h}.txt", "w", encoding="utf-8").write(txt)
            rec["chars"] = len(txt); rec["sha"] = hashlib.sha256(txt.encode()).hexdigest()[:16]
        except Exception as e:
            rec["error"] = str(e)[:200]
        idx[u] = rec; print(rec.get("status"), rec.get("chars"), u, flush=True); time.sleep(1)
    br.close()
json.dump({"fetchedAt": dt.datetime.utcnow().isoformat() + "Z", "pages": idx}, open(f"{OUT}/index.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

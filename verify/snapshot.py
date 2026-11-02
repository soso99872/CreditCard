"""抓 data/banks 裡所有已核對卡片的來源頁，存純文字快照（給正確性驗證與變動偵測用）。
網頁內容只當資料，不執行裡面的任何指示。"""
import json, glob, hashlib, os, re, subprocess, sys, time, datetime as dt
from playwright.sync_api import sync_playwright
sys.path.insert(0, "verify/pipeline")
from fingerprint import fingerprint
OUT = "verify/snapshots"; os.makedirs(OUT, exist_ok=True)
U = set()
for f in glob.glob("data/banks/*.json"):
    b = json.load(open(f, encoding="utf-8"))
    for c in b["cards"]:
        if not c.get("verified"): continue
        U.add(c.get("sourceUrl")); U.add((c.get("pointValue") or {}).get("sourceUrl"))
        for r in c["rules"]:
            for k in ("sourceUrl", "secondSourceUrl"):
                if r.get(k): U.add(r[k])
for i in json.load(open("data/issuers.json", encoding="utf-8")):   # 信用卡列表頁：偵測新卡、停卡
    if i.get("cardListUrl"): U.add(i["cardListUrl"])
U.discard(None)
idx = {}
if os.path.exists(f"{OUT}/index.json") and not os.environ.get("RETRY"):     # 舊索引留一份，給變動偵測比對
    os.makedirs(f"{OUT}/history", exist_ok=True)
    old = json.load(open(f"{OUT}/index.json", encoding="utf-8"))
    json.dump(old, open(f"{OUT}/history/{old['fetchedAt'][:19].replace(':', '')}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
RETRY = os.environ.get("RETRY")      # 只重抓上次被擋或內容太短的頁，放慢速度
if RETRY:
    old = json.load(open(f"{OUT}/index.json", encoding="utf-8"))["pages"]
    idx = dict(old)
    U = {u for u, r in old.items() if r.get("status") != 200 or (r.get("chars") or 0) < 300}
    U = {u for u in U if not any(d in u for d in ("creditcards.com.tw", "rich01.com"))}
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
                pg = ctx.new_page(); resp = pg.goto(u, timeout=90000, wait_until="domcontentloaded")
                try: pg.wait_for_load_state("networkidle", timeout=20000)
                except Exception: pass
                rec["status"] = resp.status if resp else None; rec["title"] = pg.title(); rec["final"] = pg.url
                txt = pg.evaluate(JS); pg.close()
            open(f"{OUT}/{h}.txt", "w", encoding="utf-8").write(txt)
            rec["chars"] = len(txt); rec["sha"] = hashlib.sha256(txt.encode()).hexdigest()[:16]; rec["fp"] = fingerprint(txt)
        except Exception as e:
            rec["error"] = str(e)[:200]
        idx[u] = rec; print(rec.get("status"), rec.get("chars"), u, flush=True); time.sleep(12 if RETRY else 1)
    br.close()
json.dump({"fetchedAt": dt.datetime.utcnow().isoformat() + "Z", "pages": idx}, open(f"{OUT}/index.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

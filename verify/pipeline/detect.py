"""變動偵測：跟上一次快照比，列出內容變了的頁、抓不到的頁、快到期的規則。只輸出清單，不改資料。
用法：python verify/pipeline/detect.py [到期提醒天數，預設 30]"""
import json, glob, os, sys, datetime as dt
S = "verify/snapshots"; DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 30
cur = json.load(open(f"{S}/index.json", encoding="utf-8"))
hist = sorted(glob.glob(f"{S}/history/*.json"))
prev = json.load(open(hist[-1], encoding="utf-8"))["pages"] if hist else {}
today = dt.date.fromisoformat(cur["fetchedAt"][:10])
ok = lambda r: r and r.get("status") == 200 and (r.get("chars") or 0) >= 300
uses = {}                                           # 網址 → 用到它的卡與規則
for f in glob.glob("data/banks/*.json"):
    b = json.load(open(f, encoding="utf-8"))
    for i in json.load(open("data/issuers.json", encoding="utf-8")):
        if i["id"] == b["bankId"] and i.get("cardListUrl"): uses.setdefault(i["cardListUrl"], []).append(f"{b['bankId']}:卡片列表")
    for c in b["cards"]:
        if not c.get("verified"): continue
        for r in c["rules"]:
            uses.setdefault(r.get("sourceUrl"), []).append(r["id"])
changed, blocked, expiring = [], [], []
for u, r in cur["pages"].items():
    p = prev.get(u)
    if not ok(r): blocked.append({"url": u, "status": r.get("status"), "chars": r.get("chars"), "rules": len(uses.get(u, []))})
    elif p and ok(p) and p.get("sha") != r.get("sha"):
        changed.append({"url": u, "file": r["file"], "before": p.get("file"), "uses": uses.get(u, [])})
for f in glob.glob("data/banks/*.json"):
    b = json.load(open(f, encoding="utf-8"))
    for c in b["cards"]:
        if not c.get("verified"): continue
        for r in c["rules"]:
            v = r.get("validTo")
            if v and 0 <= (dt.date.fromisoformat(v) - today).days <= DAYS:
                expiring.append({"rule": r["id"], "card": c["id"], "validTo": v, "url": r.get("sourceUrl")})
out = {"date": str(today), "compared": hist[-1] if hist else None, "changed": changed, "blocked": blocked, "expiring": expiring,
       "summary": {"pages": len(cur["pages"]), "changed": len(changed), "blocked": len(blocked), "expiringRules": len(expiring)}}
os.makedirs("verify/changes", exist_ok=True)
json.dump(out, open(f"verify/changes/{today}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(out, open("verify/changes/latest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(out["summary"], ensure_ascii=False))

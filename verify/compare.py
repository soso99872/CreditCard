"""逐條規則比對：回饋率、結束日、上限金額在來源頁快照裡找不找得到。只是找證據，找不到不等於錯，要人工看。"""
import json, glob, re, sys, unicodedata, collections
idx = json.load(open("verify/snapshots/index.json", encoding="utf-8"))["pages"]
def text(u):
    r = idx.get(u) or {}
    if r.get("status") != 200 or not r.get("chars"): return None
    t = open("verify/snapshots/" + r["file"], encoding="utf-8").read()
    t = unicodedata.normalize("NFKC", t)
    return re.sub(r"\s+", "", t).replace(",", "")
def pct_tokens(raw):
    raw = unicodedata.normalize("NFKC", raw or "")
    return sorted(set(re.findall(r"\d+(?:\.\d+)?(?=\s*%)", raw)))
def has_pct(t, n):
    return re.search(r"(?<![\d.])" + re.escape(n) + r"(?:\.0+)?%", t) is not None
def date_forms(d):
    y, m, dd = d.split("-"); yi, mi, di = int(y), int(m), int(dd); roc = yi - 1911
    return [f"{yi}/{mi}/{di}", f"{yi}/{m}/{dd}", f"{yi}.{m}.{dd}", f"{yi}.{mi}.{di}", f"{yi}年{mi}月{di}日",
            f"{yi}-{m}-{dd}", f"{roc}/{mi}/{di}", f"{roc}/{m}/{dd}", f"{roc}年{mi}月{di}日", f"{roc}.{m}.{dd}",
            f"~{mi}/{di}", f"-{mi}/{di}", f"至{mi}/{di}", f"至{m}/{dd}", f"{mi}月{di}日"]
rows = []
for f in sorted(glob.glob("data/banks/*.json")):
    b = json.load(open(f, encoding="utf-8"))
    for c in b["cards"]:
        if not c.get("verified"): continue
        for r in c["rules"]:
            u = r.get("sourceUrl"); t = text(u)
            row = {"bank": b["bankId"], "card": c["id"], "name": c["name"], "rule": r["id"], "type": r.get("sourceType", "official"),
                   "url": u, "rate": r["rate"], "raw": r.get("rawReward", ""), "validTo": r.get("validTo"), "cap": (r.get("cap") or {}).get("amount")}
            if t is None:
                row["result"] = "沒有快照"; rows.append(row); continue
            toks = pct_tokens(row["raw"]) or [str(r["rate"]).rstrip("0").rstrip(".")]
            row["pct"] = all(has_pct(t, n) for n in toks)
            row["date"] = None if not r.get("validTo") else any(x in t for x in date_forms(r["validTo"]))
            row["capok"] = None if not row["cap"] else str(int(row["cap"])) in t
            checks = [v for v in (row["pct"], row["date"], row["capok"]) if v is not None]
            row["result"] = "全部找到" if all(checks) else ("部分找到" if any(checks) else "都找不到")
            rows.append(row)
json.dump(rows, open("verify/compare.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
C = collections.Counter((x["type"], x["result"]) for x in rows)
print(len(rows)); [print(k, v) for k, v in sorted(C.items())]
for k in ("pct", "date", "capok"):
    v = [x[k] for x in rows if x.get(k) is not None]; print(k, sum(v), "/", len(v))

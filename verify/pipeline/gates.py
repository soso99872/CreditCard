"""五道關卡：兩份獨立抽取（A、B）對同一個官方頁，全部通過才算可以上線。
用法：python verify/pipeline/gates.py <提案A.json> <提案B.json> [--today YYYY-MM-DD] [--apply]
  --apply：全過時把提案寫進 data/（試行期不加，只輸出判定）

提案格式（A、B 各一份，互相看不到）：
{"extractor": "A", "page": "<官方網址>", "cards": [{"cardId": "...", "rules": [
   {<SCHEMA.md 的規則欄位，不含 sourceUrl/checkedAt/sourceType>,
    "evidence": {"rate": "原文句子", "validTo": "原文句子或 null", "validFrom": "原文句子或 null", "cap": "原文句子或 null"},
    "rateFormula": "換算式，例如 100/20000*100（原文不是直接寫百分比時才填）"}]}]}
"""
import json, glob, os, re, shutil, subprocess, sys, tempfile, unicodedata, datetime as dt
from urllib.parse import urlparse

args = [a for a in sys.argv[1:] if not a.startswith("--")]
TODAY = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--today"), str(dt.date.today()))
A, B = (json.load(open(p, encoding="utf-8")) for p in args[:2])
page = A["page"]
idx = json.load(open("verify/snapshots/index.json", encoding="utf-8"))["pages"]
norm = lambda s: re.sub(r"\s+", "", unicodedata.normalize("NFKC", s or "")).replace(",", "")
def snaptext(u):
    r = idx.get(u) or {}
    return norm(open("verify/snapshots/" + r["file"], encoding="utf-8").read()) if r.get("status") == 200 and (r.get("chars") or 0) >= 300 else None
extra = sorted(set(A.get("extraPages", [])) | set(B.get("extraPages", [])))   # 例如點數兌換頁
TEXT = snaptext(page)
issuers = json.load(open("data/issuers.json", encoding="utf-8"))
res = {"page": page, "today": TODAY, "gates": {}, "problems": []}
def fail(g, msg): res["problems"].append(f"[{g}] {msg}")

# ③ 只收官方來源（先檢查，來源不對後面就不用看）
host = urlparse(page).hostname or ""
owner = [i["id"] for i in issuers if any(host == d or host.endswith("." + d) for d in i.get("officialDomains", []))]
if not owner: fail("官方來源", f"{host} 不在任何銀行的官方網域白名單")
if TEXT is None: fail("官方來源", "沒有可用的頁面快照（被擋或內容太短）")
if A.get("page") != B.get("page"): fail("一致", "A、B 讀的不是同一頁")
for u in extra:
    h = urlparse(u).hostname or ""
    if not any(h == d or h.endswith("." + d) for i in issuers for d in i.get("officialDomains", [])): fail("官方來源", f"附加頁 {h} 不是官方網域")
    t = snaptext(u)
    if t is None: fail("官方來源", f"附加頁沒有快照：{u}")
    elif TEXT is not None: TEXT += t
for c in A["cards"]:
    if not c["rules"]: fail("格式", f"{c['cardId']} 這頁抽不到規則，保留舊資料，要補附加頁（例如點數兌換頁）")

# ① 兩份抽取完全一致（比關鍵欄位，條件文字不比）
def key(cardId, r):
    s = r.get("scope", {})
    cap = r.get("cap") or {}
    return (cardId, r.get("plan", ""), s.get("type"), tuple(sorted(s.get("categories", []))), tuple(sorted(s.get("merchants", []))),
            tuple(sorted(s.get("excludeMerchants", []))), round(float(r["rate"]), 3), cap.get("amount"), cap.get("unit"), cap.get("period"),
            r.get("validFrom"), r.get("validTo"))
KA = {key(c["cardId"], r) for c in A["cards"] for r in c["rules"]}
KB = {key(c["cardId"], r) for c in B["cards"] for r in c["rules"]}
for k in sorted(KA - KB, key=str): fail("一致", f"只有 A 有：{k}")
for k in sorted(KB - KA, key=str): fail("一致", f"只有 B 有：{k}")

# ② 每個數字都要在官方原文找得到（引用的句子要在快照裡，句子裡要有那個數字）
def date_forms(d):
    y, m, dd = d.split("-"); yi, mi, di = int(y), int(m), int(dd); roc = yi - 1911
    return [f"{yi}/{mi}/{di}", f"{yi}/{m}/{dd}", f"{yi}.{m}.{dd}", f"{yi}.{mi}.{di}", f"{yi}年{mi}月{di}日", f"{yi}-{m}-{dd}",
            f"{roc}/{mi}/{di}", f"{roc}/{m}/{dd}", f"{roc}年{mi}月{di}日", f"{roc}.{m}.{dd}", f"{mi}/{di}", f"{m}/{dd}", f"{mi}月{di}日"]
num = lambda x: ("%g" % float(x))
SAFE = re.compile(r"^[\d.+\-*/() ]+$")
for c in A["cards"]:
    for r in c["rules"]:
        ev, rid = r.get("evidence") or {}, f"{c['cardId']}/{r.get('plan') or r.get('scope', {}).get('type')}"
        quotes = {k: norm(v) for k, v in ev.items() if v}
        for k, q in quotes.items():
            if TEXT is not None and q not in TEXT: fail("原文", f"{rid} 的 {k} 引用句不在官方頁：{ev[k][:40]}")
        rq = quotes.get("rate", "")
        if r.get("rateFormula"):
            f = r["rateFormula"]
            if not SAFE.match(f): fail("原文", f"{rid} 換算式含不允許的字元")
            else:
                v = eval(f, {"__builtins__": {}})                       # 只有數字與運算子
                if abs(v - float(r["rate"])) > 0.01: fail("原文", f"{rid} 換算式 {f}={v:.3f} ≠ rate {r['rate']}")
                allq = "".join(quotes.values())
                for n in re.findall(r"\d+(?:\.\d+)?", f):
                    if n not in ("10", "100", "1000") and n not in allq: fail("原文", f"{rid} 換算式的 {n} 在引用句裡找不到")
        elif num(r["rate"]) + "%" not in rq: fail("原文", f"{rid} 回饋率 {num(r['rate'])}% 不在引用句裡")
        for fld in ("validTo", "validFrom"):
            if r.get(fld):
                q = quotes.get(fld, "")
                if not any(norm(x) in q for x in date_forms(r[fld])): fail("原文", f"{rid} {fld} {r[fld]} 不在引用句裡（官方沒寫就要填 null）")
        cap = r.get("cap")
        if cap and str(int(cap["amount"])) not in quotes.get("cap", ""): fail("原文", f"{rid} 上限 {cap['amount']} 不在引用句裡")

# ④ 合理範圍
for c in A["cards"]:
    for r in c["rules"]:
        if not 0 <= float(r["rate"]) <= 15: fail("合理範圍", f"{c['cardId']} 回饋率 {r['rate']}% 超出 0～15%")
        if r.get("validFrom") and r.get("validTo") and r["validTo"] < r["validFrom"]: fail("合理範圍", f"{c['cardId']} 結束日早於開始日")

# 套用到暫存資料夾：取代這些卡「來源是這一頁」的規則，再跑資料檢查與推薦比對
tmp = tempfile.mkdtemp(); shutil.copytree("data", f"{tmp}/data")
touched = set()
for c in A["cards"]:
    files = [f for f in glob.glob(f"{tmp}/data/banks/*.json") if any(x["id"] == c["cardId"] for x in json.load(open(f, encoding="utf-8"))["cards"])]
    if not files: fail("格式", f"找不到卡片 {c['cardId']}（新卡要先加進 coverage）"); continue
    b = json.load(open(files[0], encoding="utf-8"))
    card = next(x for x in b["cards"] if x["id"] == c["cardId"]); touched.add(c["cardId"])
    keep = [r for r in card["rules"] if r.get("sourceUrl") != page]
    new = []
    for r in c["rules"]:
        r = {k: v for k, v in r.items() if k not in ("evidence", "rateFormula")}
        r.update(sourceUrl=page, checkedAt=TODAY, sourceType="official")
        r.setdefault("id", f"{c['cardId']}-auto-{len(new) + 1}")
        new.append(r)
    card["rules"] = keep + new
    json.dump(b, open(files[0], "w", encoding="utf-8"), ensure_ascii=False, indent=2)
v = subprocess.run(["node", "scripts/validate.mjs", f"{tmp}/data"], capture_output=True, text=True)
if v.returncode != 0: fail("格式", "validate 沒過：" + (v.stdout + v.stderr).strip()[-400:])

# ⑤ 推薦比對：常用商家前 3 名改前改後
bench = lambda d: json.loads(subprocess.run(["node", "verify/pipeline/bench.mjs", d, TODAY], capture_output=True, text=True).stdout)
before, after = bench("data"), bench(f"{tmp}/data")
diffs = []
for q in before:
    b1, a1 = (before[q] or [{}])[0], (after[q] or [{}])[0]
    if b1 != a1: diffs.append({"query": q, "before": b1, "after": a1})
    if a1.get("rate", 0) > 15: fail("推薦比對", f"{q} 第一名回饋率 {a1['rate']}% 超過 15%")
res["benchDiffs"] = diffs
for g in ("官方來源", "一致", "原文", "合理範圍", "格式", "推薦比對"):
    res["gates"][g] = not any(p.startswith(f"[{g}]") for p in res["problems"])
res["pass"] = all(res["gates"].values())
if res["pass"] and "--apply" in sys.argv:
    for f in glob.glob(f"{tmp}/data/banks/*.json"): shutil.copy(f, "data/banks/")
    res["applied"] = sorted(touched)
shutil.rmtree(tmp)
print(json.dumps(res, ensure_ascii=False, indent=1))
sys.exit(0 if res["pass"] else 1)

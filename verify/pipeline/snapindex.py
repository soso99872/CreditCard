"""合併兩份快照索引：雲端（verify/snapshots，GitHub 美國主機）和台灣（verify/snapshots-tw，Soso 電腦）。
雲端抓不到、台灣抓得到的頁，就用台灣那份。每筆多一個 path 欄位指到快照檔。"""
import json, os
def ok(r): return bool(r) and r.get("status") == 200 and (r.get("chars") or 0) >= 300
def load(index_file="index.json"):
    pages = {}
    for d in ("verify/snapshots", "verify/snapshots-tw"):
        p = f"{d}/{index_file}"
        if not os.path.exists(p): continue
        for u, r in json.load(open(p, encoding="utf-8"))["pages"].items():
            r = dict(r, path=f"{d}/{r['file']}" if r.get("file") else None, source=d)
            if u not in pages or (not ok(pages[u]) and ok(r)): pages[u] = r
    return pages

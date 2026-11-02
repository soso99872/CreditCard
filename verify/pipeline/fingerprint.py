"""頁面指紋：只看「跟回饋有關的句子」（有數字加 %、元、點、日期的行），排序去重後算雜湊。
倒數計時、輪播順序、cookie 提示這類跟回饋無關的變動不會改變指紋。"""
import hashlib, re, unicodedata
REL = re.compile(r"\d+(?:\.\d+)?\s*(?:%|％|元|點|倍|日圓|円)|\d{2,4}\s*[/年.]\s*\d{1,2}\s*[/月.]\s*\d{1,2}")
NOISE = re.compile(r"cookie|Cookie|隱私|隐私|倒數|剩餘|天\s*$")
def relevant(text):
    t = unicodedata.normalize("NFKC", text)
    return sorted({re.sub(r"\s+", "", l) for l in t.splitlines() if REL.search(l) and not NOISE.search(l)})
def fingerprint(text):
    return hashlib.sha256("\n".join(relevant(text)).encode()).hexdigest()[:16]

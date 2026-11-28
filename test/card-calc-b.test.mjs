// sprint 012 T13：後半批（landbank～yuanta，11 家銀行）每張卡至少一筆試算，期望值照原文手算，不抄引擎輸出
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcReward } from "../src/engine/format.mjs";

const BANKS = "landbank megabank rakuten-card sc scsb sinopac sunnybank taishin tbb ubot yuanta".split(" ");
const cards = new Map();
for (const b of BANKS) {
  const bank = JSON.parse(readFileSync(new URL(`../data/banks/${b}.json`, import.meta.url), "utf8"));
  for (const card of bank.cards || []) cards.set(card.id, card);
}

// 欄位：卡、規則、金額、手算回饋（元，四捨五入）、算式與原文依據
const ROWS = [
  { card: "landbank-icash", rule: "landbank-icash-general", amount: 30000, expect: 300, why: "國內一般1%無上限：30000×1%" },
  { card: "megabank-bt21", rule: "megabank-bt21-general", amount: 30000, expect: 90, why: "國內外一般0.3%：30000×0.3%" },
  { card: "megabank-mega-one", rule: "megabank-mega-one-overseas", amount: 30000, expect: 450, why: "國外1.5%無上限：30000×1.5%" },
  { card: "megabank-young", rule: "megabank-young-mobile-payment-new", amount: 30000, expect: 250, why: "0.5%＋指定支付加碼1%（加碼每期最高100）：150+min(300,100)" },
  { card: "megabank-young", rule: "megabank-young-online-shopping-ebill", amount: 30000, expect: 350, why: "網購2.5%每期上限200＋電子帳單加碼0.5%無上限：150+min(750,200)" },
  { card: "megabank-cash-rebate-biz", rule: "megabank-cash-rebate-biz-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "megabank-next-bank", rule: "megabank-next-bank-general", amount: 30000, expect: 300, why: "一般1%無上限：30000×1%" },
  { card: "megabank-happy", rule: "megabank-happy-travel-platform", amount: 30000, expect: 400, why: "網購2.5%（上限200）＋加碼2.5%（上限200）合計每期上限400：min(1500,400)" },
  { card: "megabank-dual-currency", rule: "megabank-dual-currency-overseas", amount: 30000, expect: 450, why: "國外1.5%無上限：30000×1.5%" },
  { card: "rakuten-panda-j", rule: "rakuten-panda-j-jkt", amount: 30000, expect: 750, why: "基本1.5%不計入上限＋加碼2.5%每期上限300：450+min(750,300)" },
  { card: "rakuten-tiger", rule: "rakuten-tiger-designated", amount: 10000, expect: 300, why: "基本0.5%＋加碼2.5%（上限500 tigerpoints）：50+min(250,500)；金額挑在上限以下，tigerpoints 兌換率見 T13-pending" },
  { card: "sc-beyond", rule: "sc-beyond-dining", amount: 300000, expect: 13000, why: "基本1%＋加碼4%每季上限10,000：3000+min(12000,10000)；原文「加計基本1%合計5%」「每季加碼回饋合計上限」" },
  { card: "sc-signature", rule: "sc-signature-overseas", amount: 30000, expect: 300, why: "海外1%無上限：30000×1%" },
  { card: "sc-visa-infinite", rule: "sc-visa-infinite-overseas", amount: 30000, expect: 450, why: "海外紅利6倍（約1.5%）：30000×1.5%" },
  { card: "scsb-minions", rule: "scsb-minions-applepay-japan-korea", amount: 30000, expect: 970, why: "額外5%每月上限300＋原海外2.234%（上限1,000尚未到）：300+30000×2.234%=670.2" },
  { card: "scsb-visa-simple", rule: "scsb-visa-simple-applepay-japan-korea", amount: 30000, expect: 1200, why: "日韓實體3%＋額外5%每月上限300：900+min(1500,300)" },
  { card: "sinopac-dawho", rule: "sinopac-dawho-plus-overseas", amount: 30000, expect: 1600, why: "基本2%＋額外4%每月上限1,000：600+min(1200,1000)；原文「上限只計額外4%」" },
  { card: "sinopac-green", rule: "sinopac-green-green-channels", amount: 30000, expect: 600, why: "一般1%＋加碼4%每期上限300：300+min(1200,300)；原文「上限只計加碼4%部分」" },
  { card: "sinopac-vogue", rule: "sinopac-vogue-general", amount: 30000, expect: 360, why: "一般消費最高1.2%：30000×1.2%" },
  { card: "sinopac-melaleuca", rule: "sinopac-melaleuca-general", amount: 30000, expect: 120, why: "一般消費0.4%：30000×0.4%" },
  { card: "sinopac-mitsui", rule: "sinopac-mitsui-instore", amount: 30000, expect: 300, why: "館內消費最高1%豐點（1點NT$1）：30000×1%" },
  { card: "sinopac-taxicard", rule: "sinopac-taxicard-general", amount: 30000, expect: 300, why: "一般消費1% T Points無上限：30000×1%" },
  { card: "sinopac-dual-currency", rule: "sinopac-dual-currency-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "sunnybank-fcu-ipass", rule: "sunnybank-fcu-ipass-gas", amount: 30000, expect: 630, why: "基本0.5%＋加碼0.6%皆無上限，加碼3.9%每月上限300點：330+min(1170,300)" },
  { card: "sunnybank-pondafamily", rule: "sunnybank-pondafamily-daikoku", amount: 100000, expect: 3200, why: "基本1%＋日本2%無上限，加碼7%活動期間上限200點：3000+min(7000,200)" },
  { card: "sunnybank-jcb-premium", rule: "sunnybank-jcb-premium-mobile-delivery", amount: 30000, expect: 600, why: "基本1%無上限＋加碼4%每月上限300點：300+min(1200,300)" },
  { card: "sunnybank-ipass-titanium", rule: "sunnybank-ipass-titanium-gas", amount: 30000, expect: 630, why: "基本0.5%＋加碼0.6%無上限，加碼3.9%每月上限300點：330+300" },
  { card: "sunnybank-visa-yaojing", rule: "sunnybank-visa-yaojing-overseas", amount: 30000, expect: 930, why: "國外3.1%無上限：30000×3.1%" },
  { card: "sunnybank-sunnylife", rule: "sunnybank-sunnylife-mall", amount: 30000, expect: 600, why: "商店街1%＋國內基本1%＝2%無上限：30000×2%" },
  { card: "sunnybank-xworld-business", rule: "sunnybank-xworld-business-overseas", amount: 30000, expect: 900, why: "國外3%無上限：30000×3%" },
  { card: "taishin-richart", rule: "taishin-richart-chill-10-l2", amount: 30000, expect: 3000, why: "Chill刷 LEVEL 2 最高10%（累計上限為額度加30萬，遠高於此額）：30000×10%" },
  { card: "taishin-pxmart", rule: "taishin-pxmart-store", amount: 30000, expect: 360, why: "每100元12點、1點0.1元＝1.2%：30000×1.2%（原文未寫上限，金額挑在上限以下，見 T13-pending）" },
  { card: "taishin-jkopay", rule: "taishin-jkopay-select", amount: 500000, expect: 15000, why: "基本1%無上限＋加碼2.5%上限10,000街口幣／月：5000+min(12500,10000)" },
  { card: "taishin-dutyfree", rule: "taishin-dutyfree-travel", amount: 30000, expect: 600, why: "市區店／航空公司／旅行社2%：30000×2%（原文未寫上限，金額挑在上限以下，見 T13-pending）" },
  { card: "taishin-skm", rule: "taishin-skm-weekend", amount: 30000, expect: 300, why: "週五至週日合計最高1%（基本0.3%＋加碼0.7%）：30000×1%（原文未寫上限，見 T13-pending）" },
  { card: "taishin-skm-infinite", rule: "taishin-skm-infinite-general", amount: 30000, expect: 90, why: "一般0.3%無上限：30000×0.3%" },
  { card: "taishin-friday", rule: "taishin-friday-telecom", amount: 20000, expect: 200, why: "電信帳單基本回饋1%遠傳幣（1點NT$1）：20000×1%（原文未寫上限，見 T13-pending）" },
  { card: "taishin-gogoro", rule: "taishin-gogoro-general", amount: 30000, expect: 90, why: "一般0.3%無上限：30000×0.3%" },
  { card: "taishin-dual-currency", rule: "taishin-dual-currency-overseas", amount: 30000, expect: 750, why: "國外2.5%無上限：30000×2.5%" },
  { card: "taishin-tsf", rule: "taishin-tsf-general", amount: 30000, expect: 90, why: "一般0.3%無上限：30000×0.3%" },
  { card: "taishin-rose", rule: "taishin-rose-dept", amount: 150000, expect: 1500, why: "百貨滿30,000享1.2%，與一般消費共用每期上限1,500點：min(1800,1500)" },
  { card: "taishin-sun", rule: "taishin-sun-general", amount: 30000, expect: 60, why: "一般0.2%：30000×0.2%" },
  { card: "tbb-visa-infinite", rule: "tbb-visa-infinite-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "tbb-eldercaring", rule: "tbb-eldercaring-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "tbb-titanium", rule: "tbb-titanium-department", amount: 30000, expect: 620, why: "原0.4%＋活動3.6%每月共用上限500（基本不計入）：120+min(1080,500)" },
  { card: "tbb-greenlife-easy", rule: "tbb-greenlife-easy-green-restaurant", amount: 30000, expect: 450, why: "原0.5%＋加碼9.5%每月共用上限300（基本不計入）：150+min(2850,300)" },
  { card: "tbb-greenlife-ipass", rule: "tbb-greenlife-ipass-overseas", amount: 30000, expect: 450, why: "國外1.5%無上限：30000×1.5%" },
  { card: "tbb-artfun-easy", rule: "tbb-artfun-easy-overseas", amount: 30000, expect: 600, why: "國外2%：30000×2%" },
  { card: "tbb-chaotiangong", rule: "tbb-chaotiangong-lifestyle", amount: 30000, expect: 590, why: "基本0.3%不受上限，加碼4.7%每期上限500：90+min(1410,500)" },
  { card: "tbb-yilan", rule: "tbb-yilan-general", amount: 20000, expect: 60, why: "未達3萬元0.3%：20000×0.3%（達3萬享0.5%未建，見 T13-pending）" },
  { card: "tbb-smeg-business", rule: "tbb-smeg-business-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "tbb-smeg", rule: "tbb-smeg-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "tbb-temple", rule: "tbb-temple-lifestyle", amount: 30000, expect: 590, why: "基本0.3%不受上限，加碼4.7%每期上限500：90+min(1410,500)" },
  { card: "tbb-lionsclub", rule: "tbb-lionsclub-overseas", amount: 30000, expect: 600, why: "國外2%：30000×2%" },
  { card: "tbb-visa-platinum", rule: "tbb-visa-platinum-general", amount: 30000, expect: 60, why: "消費1元~49,999元回饋0.2%：30000×0.2%（高級距未建，見 T13-pending）" },
  { card: "ubot-infinite", rule: "ubot-infinite-overseas", amount: 30000, expect: 600, why: "海外2%無上限：30000×2%" },
  { card: "ubot-agribank-infinite", rule: "ubot-agribank-infinite-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "ubot-travel", rule: "ubot-travel-category", amount: 30000, expect: 300, why: "旅遊消費加倍回饋（1%）：30000×1%" },
  { card: "ubot-classic-signature", rule: "ubot-classic-signature-general", amount: 30000, expect: 300, why: "一般消費最高1%：30000×1%" },
  { card: "ubot-f1-gas", rule: "ubot-f1-gas-general", amount: 30000, expect: 150, why: "國內外一般最高0.5%無上限：30000×0.5%" },
  { card: "ubot-personal-business-platinum", rule: "ubot-personal-business-platinum-overseas", amount: 30000, expect: 300, why: "外幣消費1%：30000×1%" },
  { card: "ubot-wealth-platinum", rule: "ubot-wealth-platinum-general", amount: 30000, expect: 210, why: "國內外0.7%：30000×0.7%" },
  { card: "ubot-happiness-guard", rule: "ubot-happiness-guard-overseas", amount: 30000, expect: 450, why: "國外最高1.5%無上限：30000×1.5%" },
  { card: "ubot-national-travel", rule: "ubot-national-travel-category", amount: 30000, expect: 300, why: "旅遊消費加倍回饋（1%）：30000×1%" },
  { card: "ubot-lohas-signature", rule: "ubot-lohas-signature-supermarket", amount: 30000, expect: 210, why: "指定量販最高0.7%：30000×0.7%" },
  { card: "ubot-linebank", rule: "ubot-linebank-online-bonus", amount: 30000, expect: 600, why: "國內1%＋加碼3%（加碼歸戶每月上限300）：300+min(900,300)" },
  { card: "ubot-agribank-cobrand", rule: "ubot-agribank-cobrand-general", amount: 30000, expect: 150, why: "一般0.5%：30000×0.5%" },
  { card: "ubot-amway", rule: "ubot-amway-general", amount: 30000, expect: 90, why: "一般最高0.3%：30000×0.3%" },
  { card: "ubot-tamsui-credit", rule: "ubot-tamsui-credit-general", amount: 30000, expect: 150, why: "一般最高0.5%：30000×0.5%" },
  { card: "ubot-sunfar", rule: "ubot-sunfar-instore", amount: 30000, expect: 180, why: "店內0.6%銀行點無上限：30000×0.6%" },
  { card: "ubot-taoyuan-citizen", rule: "ubot-taoyuan-citizen-general", amount: 30000, expect: 300, why: "一般消費現金回饋1%：30000×1%" },
  { card: "yuanta-diamond-easycard", rule: "yuanta-diamond-easycard-overseas", amount: 30000, expect: 660, why: "海外2.2%無上限：30000×2.2%" },
  { card: "yuanta-share-blackbear", rule: "yuanta-share-blackbear-overseas", amount: 30000, expect: 450, why: "海外1.5%無上限：30000×1.5%" },
  { card: "yuanta-diamond-easycard-basic", rule: "yuanta-diamond-easycard-basic-overseas", amount: 30000, expect: 660, why: "海外2.2%無上限：30000×2.2%" },
  { card: "yuanta-diamond-ipass", rule: "yuanta-diamond-ipass-overseas", amount: 30000, expect: 660, why: "海外2.2%無上限：30000×2.2%" },
  { card: "yuanta-diamond-wealth", rule: "yuanta-diamond-wealth-travel-dining-diamond", amount: 400000, expect: 34800, why: "基本1.2%＋鑽石加碼10%每年上限30,000：4800+min(40000,30000)" },
  { card: "yuanta-diamond-icash-wealth", rule: "yuanta-diamond-icash-wealth-travel-dining-emerald", amount: 200000, expect: 10400, why: "基本1.2%＋翡翠加碼5%每年上限8,000：2400+min(10000,8000)" },
  { card: "yuanta-diamond-wealth-invite", rule: "yuanta-diamond-wealth-invite-overseas", amount: 30000, expect: 660, why: "海外2.2%無上限：30000×2.2%" },
  { card: "yuanta-securities", rule: "yuanta-securities-overseas", amount: 30000, expect: 660, why: "海外2.2%無上限：30000×2.2%" },
  { card: "yuanta-securities-invite", rule: "yuanta-securities-invite-overseas", amount: 30000, expect: 660, why: "海外2.2%無上限：30000×2.2%" },
  { card: "yuanta-hellokitty-diamond", rule: "yuanta-hellokitty-diamond-overseas", amount: 30000, expect: 660, why: "海外2.2%無上限：30000×2.2%" },
  { card: "yuanta-hellokitty-share", rule: "yuanta-hellokitty-share-overseas", amount: 30000, expect: 450, why: "海外1.5%無上限：30000×1.5%" },
  { card: "yuanta-diamond-icash-basic", rule: "yuanta-diamond-icash-basic-overseas", amount: 30000, expect: 660, why: "海外2.2%無上限：30000×2.2%" },
  { card: "yuanta-icash-aixian", rule: "yuanta-icash-aixian-general", amount: 200000, expect: 1000, why: "平日0.6%，每期帳單回饋上限1,000：min(1200,1000)（假日最高1%未建，見 T13-pending）" },
  { card: "yuanta-lexiang", rule: "yuanta-lexiang-lifestyle", amount: 30000, expect: 500, why: "指定通路（當期滿6,000）2%每期上限500：min(600,500)" },
];

test("後半批卡數＝84（11 家銀行 data/banks/<銀行>.json 的 cards 總數）", () => {
  assert.equal(cards.size, 84);
});

test("後半批每張卡至少有一筆試算", () => {
  const covered = new Set(ROWS.map((r) => r.card));
  assert.deepEqual([...cards.keys()].filter((id) => !covered.has(id)), []);
  for (const r of ROWS) assert.ok(cards.has(r.card), `${r.card} 不在後半批`);
});

for (const { card, rule, amount, expect, why } of ROWS) {
  test(`${rule} 刷 ${amount} → ${expect}（${why}）`, () => {
    const c = cards.get(card);
    const r = c.rules.find((x) => x.id === rule);
    assert.ok(r, `找不到規則 ${rule}`);
    const { exact } = calcReward({ rate: r.rate, baseRate: r.baseRate ?? null, subCaps: r.subCaps ?? null, cap: r.cap, twdPerPoint: c.pointValue?.twdPerPoint, amount });
    assert.equal(Math.round(exact), expect);
  });
}

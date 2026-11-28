// sprint 012 T10：前半批（bankchb～kgi，17 家銀行）每張卡至少一筆試算，期望值照原文手算，不抄引擎輸出
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcReward } from "../src/engine/format.mjs";

const BANKS = "bankchb bok bot cathay coop cotabank ctbc dbs entiebank esun feib firstbank fubon hncb hsbc hwatai kgi".split(" ");
const cards = new Map();
for (const b of BANKS) {
  const bank = JSON.parse(readFileSync(new URL(`../data/banks/${b}.json`, import.meta.url), "utf8"));
  for (const card of bank.cards || []) cards.set(card.id, card);
}

// 欄位：卡、規則、金額、手算回饋（元，四捨五入）、算式與原文依據
const ROWS = [
  { card: "chb-mygo", rule: "chb-mygo-overseas-ec-travel", amount: 30000, expect: 600, why: "基本1%無上限＋加碼5%共用上限300：300+min(1500,300)；原文「基本1%不計入」" },
  { card: "chb-myle", rule: "chb-myle-supermarket", amount: 30000, expect: 650, why: "基本0.5%＋加碼2.5%上限500：150+min(750,500)" },
  { card: "bok-gold", rule: "bok-gold-general", amount: 5000, expect: 5, why: "月刷未滿1萬千分之一：5000×0.1%（引擎只取最低級距，金額挑在最低級距內）" },
  { card: "bok-titanium", rule: "bok-titanium-general", amount: 2000, expect: 2, why: "單筆1,000至未滿3,000千分之一：2000×0.1%" },
  { card: "bot-greengo", rule: "bot-greengo-green-merchants", amount: 30000, expect: 600, why: "基本1%＋加碼5%上限300（舊戶）：300+300" },
  { card: "bot-greengo", rule: "bot-greengo-low-carbon", amount: 30000, expect: 600, why: "基本1%＋加碼5%上限300：300+300（對照集同一筆）" },
  { card: "bot-greengo", rule: "bot-greengo-mobile-pay", amount: 30000, expect: 600, why: "基本1%＋加碼1%上限300：300+min(300,300)" },
  { card: "bot-ikatong", rule: "bot-ikatong-overseas", amount: 30000, expect: 660, why: "海外2.2%無上限：30000×2.2%" },
  { card: "cathay-cube", rule: "cathay-cube-birthday-10", amount: 30000, expect: 3000, why: "慶生月指定店家10%（月累計上限為額度+50萬，遠高於此額）：30000×10%" },
  { card: "cathay-cash-rebate-signature", rule: "cathay-cash-rebate-signature-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "cathay-shopee", rule: "cathay-shopee-shopee-high", amount: 30000, expect: 600, why: "累積滿3,000享2%（年上限2萬蝦幣，30000元遠未到）：30000×2%" },
  { card: "cathay-world", rule: "cathay-world-overseas", amount: 30000, expect: 270, why: "海外單筆滿500享0.9%：30000×0.9%" },
  { card: "cathay-dual-currency", rule: "cathay-dual-currency-overseas-titanium-biz", amount: 30000, expect: 450, why: "海外單筆US$20以上1.5%：30000×1.5%" },
  { card: "coop-kanahei", rule: "coop-kanahei-category-bonus", amount: 30000, expect: 300, why: "加碼10%三項合計上限300，超過上限：min(3000,300)（基本1%是否另計待確認，保守算）" },
  { card: "coop-infinite-diamond", rule: "coop-infinite-diamond-overseas", amount: 30000, expect: 750, why: "國外2.5%無上限：30000×2.5%" },
  { card: "coop-isport", rule: "coop-isport-category-bonus", amount: 30000, expect: 300, why: "加碼5%三項合計上限300：min(1500,300)（基本是否另計待確認，保守算）" },
  { card: "coop-cooperative18", rule: "coop-cooperative18-overseas", amount: 30000, expect: 450, why: "國外1.5%無上限：30000×1.5%" },
  { card: "coop-cooperative19", rule: "coop-cooperative19-overseas", amount: 30000, expect: 900, why: "國外3%無上限：30000×3%" },
  { card: "coop-house-loan", rule: "coop-house-loan-general", amount: 30000, expect: 360, why: "一般1%＋房貸戶加碼0.2%＝1.2%：30000×1.2%" },
  { card: "coop-ipass", rule: "coop-ipass-japan", amount: 30000, expect: 900, why: "日本1%＋加碼2%＝3%（2026/12/31前）：30000×3%" },
  { card: "cotabank-general", rule: "cotabank-general-general", amount: 30000, expect: 210, why: "累計1,001元以上0.7%：30000×0.7%" },
  { card: "cotabank-lohas", rule: "cotabank-lohas-general", amount: 30000, expect: 300, why: "累計1元以上1%：30000×1%" },
  { card: "ctbc-allme", rule: "ctbc-allme-channel-pi-hami", amount: 30000, expect: 600, why: "一般1%無上限＋加碼2%上限300點：300+min(600,300)；原文「基本1%無上限」" },
  { card: "ctbc-uniopen", rule: "ctbc-uniopen-overseas-store-bonus", amount: 30000, expect: 1400, why: "國外一般2%＋實體1%＝3%無上限＋加碼8%上限500點：900+min(2400,500)" },
  { card: "ctbc-linepay-visa", rule: "ctbc-linepay-visa-vacanza", amount: 30000, expect: 600, why: "含一般1%＋加碼5%，加碼每人每月上限300點：300+min(1500,300)" },
  { card: "ctbc-linepay-jcb", rule: "ctbc-linepay-jcb-perfect-trip", amount: 30000, expect: 500, why: "含一般1%＋加碼4%每月上限200點：300+min(1200,200)" },
  { card: "dbs-aov", rule: "dbs-aov-general", amount: 30000, expect: 60, why: "一般消費0.2%：30000×0.2%" },
  { card: "dbs-eco", rule: "dbs-eco-overseas-5", amount: 30000, expect: 900, why: "1%無上限＋加碼4%月上限600點：300+min(1200,600)" },
  { card: "dbs-pchomeprime", rule: "dbs-pchomeprime-thursday", amount: 100000, expect: 5000, why: "平日4%另加2% P幣月上限1,000：4000+min(2000,1000)" },
  { card: "dbs-yours-signature-business", rule: "dbs-yours-signature-business-overseas-tier2", amount: 30000, expect: 900, why: "月累積滿20,000國外3%：30000×3%" },
  { card: "dbs-livefresh", rule: "dbs-livefresh-overseas", amount: 30000, expect: 510, why: "海外0.8%×212.5%＝1.7%：30000×1.7%" },
  { card: "dbs-everyday-signature", rule: "dbs-everyday-signature-streaming", amount: 30000, expect: 480, why: "10倍積分，每NT$25 1點、1點NT$0.04：30000/25×10×0.04" },
  { card: "dbs-everyday-platinum", rule: "dbs-everyday-platinum-general", amount: 30000, expect: 48, why: "每NT$25 1點、1點NT$0.04：30000/25×0.04" },
  { card: "dbs-everyday-titanium", rule: "dbs-everyday-titanium-general", amount: 30000, expect: 48, why: "每NT$25 1點、1點NT$0.04：30000/25×0.04" },
  { card: "dbs-insignia", rule: "dbs-insignia-general", amount: 30000, expect: 150, why: "每NT$8 1點、1點NT$0.04：30000/8×0.04" },
  { card: "dbs-vantage", rule: "dbs-vantage-general", amount: 3000, expect: 4, why: "每NT$30 1點、1點NT$0.04：3000/30×0.04（rate 0.13 為四捨五入，大額差1元，見 T10-pending）" },
  { card: "dbs-funlife", rule: "dbs-funlife-dining-cinema", amount: 3000, expect: 8, why: "2倍每NT$30 2點、1點NT$0.04：3000/30×2×0.04（rate 0.27 為四捨五入，見 T10-pending）" },
  { card: "dbs-cru", rule: "dbs-cru-general", amount: 3000, expect: 4, why: "每NT$30 1點、1點NT$0.04：3000/30×0.04（rate 0.13 為四捨五入，見 T10-pending）" },
  { card: "entie-visa", rule: "entie-visa-overseas", amount: 30000, expect: 450, why: "國外實體1.5%：30000×1.5%" },
  { card: "entie-visa-installment-platinum", rule: "entie-visa-installment-platinum-googlepay", amount: 30000, expect: 90, why: "Google Pay 0.3%：30000×0.3%" },
  { card: "entie-easycard-titanium", rule: "entie-easycard-titanium-overseas", amount: 30000, expect: 225, why: "最低級距0.25%＋國外0.5%＝0.75%：30000×0.75%（高級距未建，見 T10-pending）" },
  { card: "esun-unicard", rule: "esun-unicard-free-merchants", amount: 100000, expect: 2000, why: "基本1%＋加碼2.5%每月上限1,000點：1000+min(2500,1000)" },
  { card: "esun-ubear", rule: "esun-ubear-online", amount: 30000, expect: 150, why: "網路最高3%（基本1%＋加碼2%），上限150元；上限是否只計加碼待確認，保守算 min(900,150)" },
  { card: "esun-kumamon", rule: "esun-kumamon-japan-designated", amount: 30000, expect: 1250, why: "日本一般2.5%＋加碼6%上限500：750+min(1800,500)" },
  { card: "esun-pi-wallet", rule: "esun-pi-wallet-pi-wallet-499", amount: 30000, expect: 300, why: "最高5%（含基本1%），上限300 P幣（約可刷6,000＝300/5%，上限套整個5%）：min(1500,300)" },
  { card: "esun-dualcurrency", rule: "esun-dualcurrency-overseas", amount: 30000, expect: 450, why: "國外1.5%無上限：30000×1.5%" },
  { card: "esun-ecard", rule: "esun-ecard-general", amount: 30000, expect: 150, why: "一般0.5%：30000×0.5%" },
  { card: "esun-icash", rule: "esun-icash-711", amount: 30000, expect: 200, why: "7-ELEVEN加碼6%上限200點：min(1800,200)（基本是否另計待確認，保守算）" },
  { card: "esun-eztravel", rule: "esun-eztravel-online", amount: 30000, expect: 600, why: "易遊網2%無上限：30000×2%" },
  { card: "esun-world", rule: "esun-world-overseas", amount: 30000, expect: 300, why: "國外1%無上限：30000×1%" },
  { card: "esun-infinite", rule: "esun-infinite-general", amount: 30000, expect: 300, why: "國內1%無上限：30000×1%" },
  { card: "feib-hwcard", rule: "feib-hwcard-gas", amount: 30000, expect: 600, why: "基本1%＋加碼2%每期上限300（基本1%不計入）：300+min(600,300)" },
  { card: "firstbank-ileo", rule: "firstbank-ileo-taiwanpay", amount: 30000, expect: 250, why: "基本0.5%＋加碼1.5%每月上限100：150+min(450,100)" },
  { card: "firstbank-easycard", rule: "firstbank-easycard-breakfast", amount: 30000, expect: 1500, why: "早餐5%（官方頁未載上限）：30000×5%" },
  { card: "firstbank-wonderful", rule: "firstbank-wonderful-general", amount: 30000, expect: 150, why: "基本0.5%無上限：30000×0.5%" },
  { card: "fubon-jcard", rule: "fubon-jcard-jp-kr-th", amount: 30000, expect: 900, why: "日韓泰3%無上限（需自動扣繳或電子帳單）：30000×3%" },
  { card: "fubon-costco", rule: "fubon-costco-gas", amount: 30000, expect: 800, why: "基本2%無上限＋加碼1%每期上限200：600+min(300,200)" },
  { card: "fubon-momo", rule: "fubon-momo-store", amount: 100000, expect: 2000, why: "3% mo幣（1幣=1元）每期上限2,000，上限套整個3%：min(3000,2000)" },
  { card: "fubon-op", rule: "fubon-op-telecom-5g", amount: 30000, expect: 800, why: "1%無上限＋2.5%加碼上限500：300+min(750,500)" },
  { card: "fubon-fortune", rule: "fubon-fortune-general", amount: 30000, expect: 150, why: "0.5%無上限：30000×0.5%" },
  { card: "fubon-lifestyle", rule: "fubon-lifestyle-category", amount: 30000, expect: 225, why: "5倍紅利，每NT$20 1點、1點NT$0.03：30000/20×5×0.03" },
  { card: "hncb-bearq", rule: "hncb-bearq-dining", amount: 30000, expect: 540, why: "國內基本0.8%＋一般加碼0.2%＋餐飲加碼1%，加碼合計上限300點：240+min(360,300)" },
  { card: "hncb-rich-plus", rule: "hncb-rich-plus-overseas", amount: 30000, expect: 600, why: "海外2%無上限：30000×2%" },
  { card: "hncb-diamond", rule: "hncb-diamond-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "hncb-ishopping", rule: "hncb-ishopping-online", amount: 30000, expect: 240, why: "接力：2%到上限200元（刷10,000）後改每25元1點×NT$0.05＝0.2%：200+20,000×0.2%" },
  { card: "hncb-gourmet", rule: "hncb-gourmet-overseas", amount: 30000, expect: 300, why: "國外5倍，每25元1點、1點NT$0.05：30000/25×5×0.05" },
  { card: "hsbc-cashback-signature", rule: "hsbc-cashback-signature-overseas", amount: 30000, expect: 666, why: "國外2.22%無上限：30000×2.22%" },
  { card: "hsbc-cashback-titanium", rule: "hsbc-cashback-titanium-selected-channels", amount: 100000, expect: 2333, why: "接力：3%到上限2,000點（刷66,667）後改1%：2000+(100000−66667)×1%" },
  { card: "hsbc-liveplus", rule: "hsbc-liveplus-triple-channels-autopay", amount: 30000, expect: 1352, why: "0.88%無上限＋3%上限888點＋自動扣繳1%上限200點：264+888+200" },
  { card: "hwatai-visa-gold", rule: "hwatai-visa-gold-general", amount: 30000, expect: 150, why: "20元1點、1000點抵100元＝0.5%：30000/20×0.1" },
  { card: "hwatai-jcb", rule: "hwatai-jcb-general", amount: 30000, expect: 150, why: "20元1點、1000點抵100元＝0.5%：30000/20×0.1" },
  { card: "kgi-visa-infinite", rule: "kgi-visa-infinite-overseas", amount: 30000, expect: 450, why: "國外1.5%：30000×1.5%" },
  { card: "kgi-crypto", rule: "kgi-crypto-dining-gas", amount: 30000, expect: 600, why: "基本1%＋指定通路加碼2%上限300點：300+min(600,300)" },
  { card: "kgi-eslite", rule: "kgi-eslite-store-gold", amount: 60000, expect: 1580, why: "基本0.3%＋額外3.7%上限1,400點：180+min(2220,1400)" },
  { card: "kgi-more-buy", rule: "kgi-more-buy-mobile-payment", amount: 30000, expect: 510, why: "基礎0.7%＋額外3.3%上限300點：210+min(990,300)" },
  { card: "kgi-cash-back", rule: "kgi-cash-back-overseas", amount: 30000, expect: 600, why: "國外2%無上限：30000×2%" },
  { card: "kgi-life-infinite", rule: "kgi-life-infinite-general", amount: 30000, expect: 300, why: "國內外1%：30000×1%" },
  { card: "kgi-life-signature", rule: "kgi-life-signature-general", amount: 30000, expect: 300, why: "國內外1%無上限：30000×1%" },
  { card: "kgi-more-fun", rule: "kgi-more-fun-cinema", amount: 30000, expect: 500, why: "影城50%，當期帳單上限500點：min(15000,500)" },
  { card: "kgi-morerich", rule: "kgi-morerich-overseas", amount: 30000, expect: 450, why: "國外1.5%無上限：30000×1.5%" },
];

test("前半批卡數＝78（17 家銀行 data/banks/<銀行>.json 的 cards 總數）", () => {
  assert.equal(cards.size, 78);
});

test("前半批每張卡至少有一筆試算", () => {
  const covered = new Set(ROWS.map((r) => r.card));
  assert.deepEqual([...cards.keys()].filter((id) => !covered.has(id)), []);
  for (const r of ROWS) assert.ok(cards.has(r.card), `${r.card} 不在前半批`);
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

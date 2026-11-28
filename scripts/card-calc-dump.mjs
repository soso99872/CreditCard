// 每條規則在固定金額下的試算回饋（元，四捨五入），給對照集比對用：
// node scripts/card-calc-dump.mjs <輸出.jsonl>
// 每行 {"id": 規則 id, "card": 卡 id, "r1000": …, "r6000": …, "r10000": …, "r30000": …, "r150000": …, "r200000": …}
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { calcReward } from "../src/engine/format.mjs";

const AMOUNTS = [1000, 6000, 10000, 30000, 150000, 200000];
const dir = new URL("../data/banks/", import.meta.url);
const lines = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
  for (const card of JSON.parse(readFileSync(new URL(f, dir), "utf8")).cards || []) {
    for (const rule of card.rules) {
      const row = { id: rule.id, card: card.id };
      for (const amount of AMOUNTS) {
        const params = { rate: rule.rate, baseRate: rule.baseRate ?? null, subCaps: rule.subCaps ?? null, cap: rule.cap, twdPerPoint: card.pointValue?.twdPerPoint, amount };
        row[`r${amount}`] = Math.round(calcReward(params).exact);
      }
      lines.push(JSON.stringify(row));
    }
  }
}
writeFileSync(process.argv[2] || "card-calc.jsonl", lines.join("\n") + "\n");
console.log(`${lines.length} 條規則`);

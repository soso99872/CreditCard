// 首頁示意卡（sprint 009 T06）：從「全聯」的推薦清單挑第一張一般人拿得到的卡。
// 排序 v2（sprint 010）上線前的過渡規則：有方案（plan），或條件裡有資產／存款／月均／等級／帳戶類門檻的卡跳過。

const GATE = /資產|存款|月均|平均餘額|等級|level|帳戶|數位會員/i;

/**
 * @param {Array<{plan?: string, conditions?: string[]}>} recommendations 已排序的推薦清單
 * @returns {object | null} 第一張沒有門檻的卡；全都有門檻或清單為空時回 null（不顯示示意卡）
 */
export function pickDemoCard(recommendations) {
  return (
    (recommendations || []).find(
      (rec) => !rec.plan && !(rec.conditions || []).some((text) => GATE.test(text))
    ) ?? null
  );
}

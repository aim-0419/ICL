/**
 * [화면 스타일 지문 비교]
 *
 * style:snapshot 으로 찍어 둔 두 기록을 비교해, 화면이 어디서 어떻게
 * 달라졌는지 요소 단위로 짚어 줍니다.
 *
 *   npm run style:diff -- before.json after.json
 *
 * 달라진 곳이 없으면 종료 코드 0, 있으면 1 을 돌려주므로
 * 자동화된 검사에서도 쓸 수 있습니다.
 */
import fs from "node:fs";

const [beforePath, afterPath] = process.argv.slice(2);
const detailLimit = Number(process.env.STYLE_DIFF_DETAILS || 12);

if (!beforePath || !afterPath) {
  console.error("[style-diff] 비교할 두 파일이 필요합니다.\n  npm run style:diff -- before.json after.json");
  process.exit(1);
}

const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
const after = JSON.parse(fs.readFileSync(afterPath, "utf8"));

const screens = new Set([...Object.keys(before), ...Object.keys(after)]);
let changedElements = 0;
const byScreen = {};
const details = [];

for (const screen of screens) {
  const rowsBefore = before[screen] || [];
  const rowsAfter = after[screen] || [];
  let screenChanges = 0;

  for (let i = 0; i < Math.max(rowsBefore.length, rowsAfter.length); i += 1) {
    if (rowsBefore[i] === rowsAfter[i]) continue;
    changedElements += 1;
    screenChanges += 1;

    if (details.length >= detailLimit) continue;

    const [elementLabel, valuesBefore = ""] = String(rowsBefore[i] || "(없던 요소)").split(" => ");
    const [, valuesAfter = ""] = String(rowsAfter[i] || "(사라진 요소)").split(" => ");
    const partsBefore = valuesBefore.split("|");
    const partsAfter = valuesAfter.split("|");

    const changes = [];
    for (let p = 0; p < Math.max(partsBefore.length, partsAfter.length); p += 1) {
      if (partsBefore[p] === partsAfter[p]) continue;
      changes.push(`      "${partsBefore[p]}" -> "${partsAfter[p]}"`);
    }
    details.push(`  [${screen}] ${elementLabel}\n${changes.slice(0, 5).join("\n")}`);
  }

  if (screenChanges > 0) byScreen[screen] = screenChanges;
}

if (changedElements === 0) {
  console.log("[style-diff] 달라진 곳이 없습니다. 화면은 그대로입니다.");
  process.exit(0);
}

console.log(`[style-diff] 달라진 요소 ${changedElements}개`);
console.log("\n화면별 변경 수:");
for (const [screen, count] of Object.entries(byScreen).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${screen.padEnd(22)} ${count}`);
}
console.log("\n변경 내용 일부:");
details.forEach((line) => console.log(line));
if (changedElements > detailLimit) {
  console.log(`\n  ... 외 ${changedElements - detailLimit}개. 더 보려면 STYLE_DIFF_DETAILS 환경변수를 올리세요.`);
}
process.exit(1);

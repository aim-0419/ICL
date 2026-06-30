import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "scripts"];
const sourceExtensions = new Set([".js", ".mjs"]);

function collectSourceFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const filePath = path.join(directory, name);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(filePath));
    } else if (sourceExtensions.has(path.extname(name))) {
      files.push(filePath);
    }
  }
  return files;
}

const files = roots.flatMap((root) => collectSourceFiles(root));
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`[syntax-check] ${files.length}개 파일 검사 완료`);

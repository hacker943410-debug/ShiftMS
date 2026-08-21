// docs/codebase-map.md 가 가리키는 파일이 전부 실제로 있는지 확인한다.
// 지도는 낡는 순간 해로워지므로(없는 파일로 안내), 파일을 옮기거나 지우면 여기서 걸린다.
//
//   node scripts/validate-codebase-map.mjs
//
// 문서는 `main/services/...` 처럼 src/ 를 생략한 축약 표기를 쓰므로 접두어 후보를 함께 시도한다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const mapPath = path.join(root, "docs", "codebase-map.md");

if (!existsSync(mapPath)) {
  console.error("docs/codebase-map.md 가 없습니다.");
  process.exit(1);
}

const PREFIXES = [
  "",
  "src/",
  "src/main/",
  "src/main/services/",
  "src/main/ipc/",
  "src/renderer/",
  "src/renderer/components/",
  "src/renderer/guides/",
  "src/renderer/screens/",
  "src/shared/",
  "src/shared/domain/",
  "src/shared/lib/",
  "artifacts/scripts/",
  "scripts/",
  "docs/"
];

// 경로가 아니거나, 일부러 예시로 쓴 표기는 건너뛴다.
const isSkippable = (token) =>
  /^%|^npm |^node |^new DatabaseSync|^C:\\/.test(token) ||
  /^-|\*|…|vX\.Y\.Z|X\.Y\.Z/.test(token);

const looksLikePath = (token) =>
  /\.(ts|tsx|css|md|mjs|cjs|json|ps1|sqlite)$/.test(token) || token.includes("/");

const text = readFileSync(mapPath, "utf8");
const tokens = new Set();

for (const match of text.matchAll(/`([^`\n]+)`/g)) {
  const raw = match[1].trim();

  if (isSkippable(raw) || !looksLikePath(raw)) {
    continue;
  }

  tokens.add(raw.replace(/\\/g, "/").replace(/\/$/, ""));
}

const missing = [];

for (const token of [...tokens].sort()) {
  const exists = PREFIXES.some((prefix) => existsSync(path.join(root, prefix + token)));

  if (!exists) {
    missing.push(token);
  }
}

if (missing.length > 0) {
  console.error(`docs/codebase-map.md 가 없는 경로를 가리킵니다 (${missing.length}건):`);
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  console.error("\n파일을 옮겼거나 지웠다면 지도의 해당 줄도 함께 고쳐 주세요.");
  process.exit(1);
}

console.log(`CODEBASE_MAP_OK — 경로 ${tokens.size}개 모두 존재합니다.`);

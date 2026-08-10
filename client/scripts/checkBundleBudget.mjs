#!/usr/bin/env node
/**
 * 초기 다운로드 페이로드에 gzip 예산을 강제한다.
 *
 * 왜 index.html을 파싱하는가: 브라우저가 첫 로드에 실제로 받는 파일은 "dist/assets 전체"가
 * 아니라 엔트리 스크립트 + 그 정적 의존성(Vite가 modulepreload로 심어둔 것) + 렌더 블로킹
 * 스타일시트다. lazy 청크는 여기 안 나타난다. 그래서 index.html의 태그 집합이 곧 예산
 * 대상이며, 이 방식이라야 "라우트를 lazy로 쪼갰다"는 사실이 숫자에 정직하게 반영된다.
 *
 * 이 검사가 잡아내려는 회귀: router.tsx에서 lazy를 정적 import로 되돌리거나,
 * shared/lib/firebase.ts에 getFirestore를 다시 넣거나, 무거운 의존성을 초기 경로에
 * 추가하는 변경. 셋 다 엔트리 청크를 눈에 띄게 부풀린다.
 */
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(clientDir, "dist");
const indexHtml = path.join(distDir, "index.html");
const budgetFile = path.join(clientDir, "bundle-budget.json");

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

if (!existsSync(indexHtml)) {
  fail(`dist/index.html이 없습니다. 먼저 \`npm run build\`를 실행하세요.`);
}

const html = readFileSync(indexHtml, "utf8");

// 엔트리 스크립트, modulepreload, 렌더 블로킹 스타일시트를 모은다.
// 속성 순서가 고정이 아니므로 태그 단위로 잘라낸 뒤 src/href를 뽑는다.
const collectAssets = () => {
  const found = [];
  const tagRe = /<(script|link)\b[^>]*>/gi;
  for (const [tag] of html.matchAll(tagRe)) {
    const isModuleScript =
      /^<script/i.test(tag) && /type=["']module["']/i.test(tag);
    const rel = tag.match(/rel=["']([^"']+)["']/i)?.[1];
    const isPreload = rel === "modulepreload";
    const isStylesheet = rel === "stylesheet";
    if (!isModuleScript && !isPreload && !isStylesheet) continue;

    const url = tag.match(/(?:src|href)=["']([^"']+)["']/i)?.[1];
    // 외부 CDN(폰트 등)은 우리 번들이 아니므로 제외한다.
    if (!url || !url.startsWith("/")) continue;
    found.push(url);
  }
  return [...new Set(found)];
};

const assets = collectAssets();
if (assets.length === 0) {
  fail("index.html에서 초기 에셋을 하나도 찾지 못했습니다. 파서를 확인하세요.");
}

const rows = assets.map((url) => {
  const filePath = path.join(distDir, url.replace(/^\//, ""));
  if (!existsSync(filePath)) {
    fail(`index.html이 참조하는 ${url} 파일이 dist에 없습니다.`);
  }
  const raw = readFileSync(filePath);
  return {
    url,
    rawBytes: raw.length,
    gzipBytes: gzipSync(raw, { level: 9 }).length,
  };
});

const totalGzip = rows.reduce((sum, r) => sum + r.gzipBytes, 0);

if (!existsSync(budgetFile)) {
  fail(`bundle-budget.json이 없습니다. 측정된 초기 gzip: ${totalGzip} bytes`);
}
const { initialGzipBytes: budget } = JSON.parse(readFileSync(budgetFile, "utf8"));
if (typeof budget !== "number") {
  fail("bundle-budget.json의 initialGzipBytes가 숫자가 아닙니다.");
}

const kb = (n) => `${(n / 1024).toFixed(2)} kB`;

console.log("\n초기 다운로드 페이로드 (index.html이 직접 참조하는 파일)\n");
for (const r of rows.sort((a, b) => b.gzipBytes - a.gzipBytes)) {
  console.log(`  ${r.url.padEnd(44)} ${kb(r.rawBytes).padStart(11)}  gzip ${kb(r.gzipBytes).padStart(10)}`);
}
console.log(`  ${" ".repeat(57)}${"─".repeat(15)}`);
console.log(`  ${"합계".padEnd(56)} gzip ${kb(totalGzip).padStart(10)}`);
console.log(`  ${"예산".padEnd(56)}      ${kb(budget).padStart(10)}`);

const diff = totalGzip - budget;
if (diff > 0) {
  fail(
    `초기 페이로드가 예산을 ${kb(diff)} 초과했습니다 (${kb(totalGzip)} > ${kb(budget)}).\n` +
      `  라우트 lazy 분할이 풀렸거나(router.tsx), 무거운 의존성이 초기 경로에 들어왔을 수 있습니다.\n` +
      `  의도한 증가라면 client/bundle-budget.json의 initialGzipBytes를 근거와 함께 올리세요.`,
  );
}

const headroom = ((-diff / budget) * 100).toFixed(1);
console.log(`\n✔ 예산 이내 (여유 ${kb(-diff)}, ${headroom}%)\n`);

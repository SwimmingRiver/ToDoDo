const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// packages/core(@tododo/core)는 file: 의존성(심볼릭 링크)으로 연결되는데, Metro가
// 심볼릭 링크를 실제 경로 기준으로 해석하기 때문에 packages/core 자체에 별도의
// firebase가 설치돼 있으면(devDependency라 packages/core에서 npm install만 해도 생김)
// mobile의 firebase와 서로 다른 모듈 인스턴스가 되어 `Firestore` 클래스 instanceof
// 검사가 깨진다("Expected ... FirebaseFirestore" 에러, getTodos 등 모든 Firestore
// 호출이 실패).
//
// extraNodeModules만으로는 효과가 없다 — packages/core/dist/index.js가
// "firebase/firestore"를 require할 때, packages/core/node_modules/firebase가
// 일반 계층적 탐색으로 먼저 발견되기 때문에 extraNodeModules(탐색 실패 시에만
// 쓰이는 폴백)까지 도달하지 않는다. 게다가 packages/core는 mobile의 형제
// 디렉터리라 계층적 탐색이 애초에 mobile/node_modules까지 올라가지도 않는다.
// 그래서 두 가지를 함께 써야 한다: blockList로 packages/core 안의 firebase를
// 찾지 못하게 막고(정상 탐색을 실패시켜 폴백을 타게 함), extraNodeModules로
// "firebase"를 mobile/node_modules/firebase로 명시적으로 리다이렉트한다.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]),
  new RegExp(`${escapeRegExp(path.resolve(__dirname, "../packages/core/node_modules/firebase"))}.*`),
];

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  firebase: path.resolve(__dirname, "node_modules/firebase"),
};

module.exports = config;

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// packages/core(@tododo/core)는 file: 의존성(심볼릭 링크)으로 연결되는데, Metro가
// 심볼릭 링크를 실제 경로 기준으로 해석하기 때문에 packages/core 자체에 별도의
// firebase가 설치돼 있으면 mobile의 firebase와 서로 다른 모듈 인스턴스가 되어
// `Firestore` 클래스 instanceof 검사가 깨진다("Expected ... FirebaseFirestore" 에러).
// firebase 관련 서브패스는 항상 mobile의 node_modules에서만 resolve하도록 고정한다.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  firebase: path.resolve(__dirname, "node_modules/firebase"),
};

module.exports = config;

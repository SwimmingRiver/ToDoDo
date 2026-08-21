module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    env: {
      // Jest 실행 시 `await import(...)`가 Node의 네이티브 ESM 로더 없이도
      // 동작하도록 CommonJS interop으로 변환한다.
      test: {
        plugins: ["babel-plugin-dynamic-import-node"],
      },
    },
  };
};

// jest 전용 firebase/firestore 스텁(jest.config.js 참고). 어떤 이름을 import해도 no-op 함수가 된다.
module.exports = new Proxy({ __esModule: true }, {
  get: (target, key) => (key in target ? target[key] : () => undefined),
});

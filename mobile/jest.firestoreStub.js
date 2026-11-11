// jest 전용 firebase/firestore 스텁(jest.config.js 참고). 어떤 이름을 import해도 no-op 함수가 된다.
// then/default/Symbol 키는 undefined로 돌려줘 모듈이 thenable·default-export로 오인되지 않게 한다.
module.exports = new Proxy({ __esModule: true }, {
  get: (target, key) => {
    if (key in target) return target[key];
    if (typeof key === "symbol" || key === "then" || key === "default") return undefined;
    return () => undefined;
  },
});

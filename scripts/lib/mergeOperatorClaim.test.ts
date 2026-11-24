import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeOperatorClaim } from "./mergeOperatorClaim";

test("부여하면 다른 클레임을 보존하고 operator를 추가한다", () => {
  assert.deepEqual(mergeOperatorClaim({ premiumUntil: 99 }, true), { premiumUntil: 99, operator: true });
});

test("회수하면 operator만 제거한다", () => {
  assert.deepEqual(mergeOperatorClaim({ premiumUntil: 99, operator: true }, false), { premiumUntil: 99 });
});

test("기존 클레임이 없어도 부여할 수 있다", () => {
  assert.deepEqual(mergeOperatorClaim(undefined, true), { operator: true });
});

test("레거시 premium 키는 제거한다", () => {
  assert.deepEqual(mergeOperatorClaim({ premium: true }, true), { operator: true });
});

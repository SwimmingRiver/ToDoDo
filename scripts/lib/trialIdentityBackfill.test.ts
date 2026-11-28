import { test } from "node:test";
import assert from "node:assert/strict";
import { canApplyBackfillAt, planTrialIdentityBackfill, trialIdentityKeyMap } from "./trialIdentityBackfill";

// openssl로 따로 계산한 값(printf 'google.com:g1' | openssl dgst -sha256 -hmac s). billing-proxy의 hmacSha256Hex와 같아야 한다.
const G1 = "6eb14265ace07c34854428bbf421ce1595c9a8c901f15de6fcf8ed10a6bdc322";
const A1 = "ce323352aac3a697a4cf9a74aafe559f638030bb4653a222b233eb4a7ef431ba";
const T = "2026-11-20T00:00:00.000Z";

test("Google·Apple 연결만 billing-proxy와 같은 HMAC 키로 바꾸고, 다른 로그인 수단은 버린다", () => {
  assert.deepEqual(
    trialIdentityKeyMap("s", [
      { providerId: "google.com", uid: "g1" },
      { providerId: "apple.com", uid: "a1" },
      { providerId: "password", uid: "x@example.com" },
    ]),
    { [G1]: "google.com", [A1]: "apple.com" },
  );
});

test("체험을 쓴 문서에만 지금 연결된 계정 키를 채우고, 이미 있는 키는 보존한다", () => {
  const plan = planTrialIdentityBackfill({
    secret: "s",
    docs: [
      { uid: "trialed", trialUsedAt: T, trialIdentities: {} },
      { uid: "partial", trialUsedAt: T, trialIdentities: { old: "apple.com" } },
      { uid: "paid-only", trialUsedAt: null, trialIdentities: {} },
    ],
    providersByUid: new Map([
      ["trialed", [{ providerId: "google.com", uid: "g1" }]],
      ["partial", [{ providerId: "google.com", uid: "g1" }]],
      ["paid-only", [{ providerId: "google.com", uid: "g1" }]],
    ]),
  });
  assert.deepEqual(plan.writes, [
    { uid: "trialed", trialIdentities: { [G1]: "google.com" } },
    { uid: "partial", trialIdentities: { old: "apple.com", [G1]: "google.com" } },
  ]);
  assert.equal(plan.counts.trialed, 2);
});

test("이미 다 채워진 문서·연결 계정이 없는 사용자·Auth에 없는 사용자는 쓰지 않고 따로 센다", () => {
  const plan = planTrialIdentityBackfill({
    secret: "s",
    docs: [
      { uid: "complete", trialUsedAt: T, trialIdentities: { [G1]: "google.com" } },
      { uid: "no-identity", trialUsedAt: T, trialIdentities: {} },
      { uid: "gone", trialUsedAt: T, trialIdentities: {} },
    ],
    providersByUid: new Map([
      ["complete", [{ providerId: "google.com", uid: "g1" }]],
      ["no-identity", [{ providerId: "password", uid: "x@example.com" }]],
      ["gone", null],
    ]),
  });
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.counts, { trialed: 3, alreadyComplete: 1, noIdentity: 1, userMissing: 1 });
});

test("Worker가 이미 남긴 키가 입력한 시크릿으로 다시 만들어지면 시크릿이 맞다고 본다", () => {
  const plan = planTrialIdentityBackfill({
    secret: "s",
    docs: [{ uid: "by-worker", trialUsedAt: T, trialIdentities: { [G1]: "google.com" } }],
    providersByUid: new Map([["by-worker", [{ providerId: "google.com", uid: "g1" }]]]),
  });
  assert.equal(plan.secretCheck, "verified");
});

test("Worker가 남긴 키가 있는 문서가 둘 이상인데 하나도 다시 만들어지지 않으면 시크릿이 틀렸다고 보고 쓰기 계획을 비운다", () => {
  const plan = planTrialIdentityBackfill({
    secret: "wrong",
    docs: [
      { uid: "by-worker-1", trialUsedAt: T, trialIdentities: { [G1]: "google.com" } },
      { uid: "by-worker-2", trialUsedAt: T, trialIdentities: { [A1]: "apple.com" } },
      { uid: "trialed", trialUsedAt: T, trialIdentities: {} },
    ],
    providersByUid: new Map([
      ["by-worker-1", [{ providerId: "google.com", uid: "g1" }]],
      ["by-worker-2", [{ providerId: "apple.com", uid: "a1" }]],
      ["trialed", [{ providerId: "apple.com", uid: "a9" }]],
    ]),
  });
  assert.equal(plan.secretCheck, "mismatch");
  assert.deepEqual(plan.writes, []);
});

test("대조할 문서가 하나뿐이고 안 맞으면(그 사용자가 계정을 바꿨을 수도 있다) 중단하지 않고 확인 불가로 본다", () => {
  const plan = planTrialIdentityBackfill({
    secret: "s",
    docs: [
      { uid: "switched", trialUsedAt: T, trialIdentities: { "old-google-key": "google.com" } },
      { uid: "trialed", trialUsedAt: T, trialIdentities: {} },
    ],
    providersByUid: new Map([
      ["switched", [{ providerId: "google.com", uid: "g2" }]],
      ["trialed", [{ providerId: "google.com", uid: "g1" }]],
    ]),
  });
  assert.equal(plan.secretCheck, "unverifiable");
  assert.ok(plan.writes.some((w) => w.uid === "trialed"));
});

test("대조할 Worker 기록이 없으면 시크릿을 확인할 수 없다고 알린다", () => {
  const plan = planTrialIdentityBackfill({
    secret: "s",
    docs: [{ uid: "trialed", trialUsedAt: T, trialIdentities: {} }],
    providersByUid: new Map([["trialed", [{ providerId: "google.com", uid: "g1" }]]]),
  });
  assert.equal(plan.secretCheck, "unverifiable");
  assert.equal(plan.writes.length, 1);
});

test("실제 쓰기는 4판 시행 시각(2026-12-28 00:00 KST)부터만 허용한다", () => {
  assert.equal(canApplyBackfillAt(new Date("2026-12-27T14:59:59.999Z")), false);
  assert.equal(canApplyBackfillAt(new Date("2026-12-27T15:00:00.000Z")), true);
});

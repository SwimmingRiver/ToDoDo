#!/usr/bin/env node
/**
 * 로컬 wrangler dev(billing-proxy)에 Paddle 형식 subscription 웹훅을 서명해서 보낸다.
 * Paddle 계정 없이 웹훅 → 클레임·문서 반영 → 클라이언트 실시간 갱신 흐름을 확인하기 위한 개발 도구.
 * 서명 키는 .dev.vars의 PADDLE_WEBHOOK_SECRET·BILLING_UID_SECRET을 읽는다(운영 시크릿과 무관).
 *
 * 사용법 (billing-proxy 디렉터리에서):
 *   node scripts/sendTestWebhook.mjs <uid> <시나리오> [--sub sub_test_1] [--url http://localhost:8787]
 *
 * 시나리오:
 *   active           구독 시작/갱신 (기간 끝 = 지금+30일)
 *   cancel-scheduled 기간 끝에 해지 예약
 *   past-due         결제 실패(재시도 중)
 *   canceled         즉시 해지
 *   forged-sig       uid_sig 위조 → 반영되지 않아야 함
 *   trialing         Paddle 체험 상태(쓰지 않는 상태) → 경고 후 active처럼 반영
 * 다른 구독의 해지를 흉내 내려면: canceled --sub sub_other
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : fallback;
};
const [uid, scenario] = args;
const subscriptionId = option("--sub", "sub_test_1");
const url = option("--url", "http://localhost:8787");

const SCENARIOS = ["active", "cancel-scheduled", "past-due", "canceled", "forged-sig", "trialing"];
if (!uid || !SCENARIOS.includes(scenario)) {
  console.error(`사용법: node scripts/sendTestWebhook.mjs <uid> <${SCENARIOS.join("|")}> [--sub id] [--url url]`);
  process.exit(1);
}

const devVars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const webhookSecret = devVars.PADDLE_WEBHOOK_SECRET;
const uidSecret = devVars.BILLING_UID_SECRET;
if (!webhookSecret || !uidSecret) {
  console.error(".dev.vars에 PADDLE_WEBHOOK_SECRET·BILLING_UID_SECRET이 필요합니다");
  process.exit(1);
}

const hmacHex = (key, message) => createHmac("sha256", key).update(message).digest("hex");
const now = new Date();
const periodEnd = new Date(now.getTime() + 30 * 86_400_000).toISOString();

const status = { active: "active", "cancel-scheduled": "active", "past-due": "past_due", canceled: "canceled", "forged-sig": "active", trialing: "trialing" }[scenario];
const body = JSON.stringify({
  event_id: `evt_local_${now.getTime()}`,
  event_type: scenario === "canceled" ? "subscription.canceled" : "subscription.updated",
  occurred_at: now.toISOString(),
  data: {
    id: subscriptionId,
    status,
    customer_id: "ctm_local_test",
    custom_data: { uid, uid_sig: scenario === "forged-sig" ? "0".repeat(64) : hmacHex(uidSecret, uid) },
    current_billing_period: scenario === "canceled" ? null : { starts_at: now.toISOString(), ends_at: periodEnd },
    scheduled_change: scenario === "cancel-scheduled" ? { action: "cancel", effective_at: periodEnd, resumes_at: null } : null,
  },
});

const ts = Math.floor(now.getTime() / 1000);
const res = await fetch(`${url}/webhooks/paddle`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Paddle-Signature": `ts=${ts};h1=${hmacHex(webhookSecret, `${ts}:${body}`)}` },
  body,
});
console.log(`${scenario} (${subscriptionId}) → ${res.status} ${await res.text()}`);

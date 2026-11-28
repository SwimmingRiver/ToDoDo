import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { createEnv, dbAs, seed } from "./env";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env?.cleanup(); // beforeAll(createEnv)가 실패하면 env가 없다 — 원래 오류를 가리지 않게
});

const OPERATOR = { operator: true };
const nowSec = () => Math.floor(Date.now() / 1000);

describe("feedback", () => {
  beforeEach(async () => {
    await seed(env, "feedback/f1", { userId: "alice", message: "의견", status: "new" });
  });

  it("운영자는 읽는다", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "op", OPERATOR), "feedback/f1")));
  });
  it("일반 사용자는 자기 의견도 못 읽는다", async () => {
    await assertFails(getDoc(doc(dbAs(env, "alice"), "feedback/f1")));
  });
  it("일반 사용자는 직접 만들 수 없다", async () => {
    await assertFails(setDoc(doc(dbAs(env, "alice"), "feedback/f2"), { userId: "alice", message: "x", status: "new" }));
  });
  it("운영자도 직접 만들 수 없다", async () => {
    await assertFails(setDoc(doc(dbAs(env, "op", OPERATOR), "feedback/f2"), { message: "x", status: "new" }));
  });
  it("운영자는 status를 허용된 값으로 바꾼다", async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, "op", OPERATOR), "feedback/f1"), { status: "done" }));
  });
  it("운영자도 허용되지 않은 status 값은 못 쓴다", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "op", OPERATOR), "feedback/f1"), { status: "bogus" }));
  });
  it("운영자도 status 외 필드는 못 바꾼다", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "op", OPERATOR), "feedback/f1"), { status: "done", message: "변조" }));
  });
  it("operator 클레임이 true가 아니면 운영자가 아니다", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "op", { operator: "true" }), "feedback/f1"), { status: "done" }));
  });
  it("일반 사용자는 status를 못 바꾼다", async () => {
    await assertFails(updateDoc(doc(dbAs(env, "alice"), "feedback/f1"), { status: "done" }));
  });
  it("운영자도 지울 수 없다", async () => {
    await assertFails(deleteDoc(doc(dbAs(env, "op", OPERATOR), "feedback/f1")));
  });
});

describe("calendarIntegrations", () => {
  beforeEach(async () => {
    await seed(env, "calendarIntegrations/alice", { connected: true });
  });
  const premium = () => ({ premiumUntil: nowSec() + 3600 });

  it("프리미엄이 유효한 본인은 읽고 쓴다", async () => {
    const db = dbAs(env, "alice", premium());
    await assertSucceeds(getDoc(doc(db, "calendarIntegrations/alice")));
    await assertSucceeds(setDoc(doc(db, "calendarIntegrations/alice"), { connected: false }));
  });
  it("프리미엄이 만료된 본인은 못 읽는다", async () => {
    await assertFails(getDoc(doc(dbAs(env, "alice", { premiumUntil: nowSec() - 3600 }), "calendarIntegrations/alice")));
  });
  it("프리미엄 클레임이 없는 본인은 못 쓴다", async () => {
    await assertFails(setDoc(doc(dbAs(env, "alice"), "calendarIntegrations/alice"), { connected: false }));
  });
  it("premiumUntil이 숫자가 아니면 거부된다", async () => {
    await assertFails(getDoc(doc(dbAs(env, "alice", { premiumUntil: String(nowSec() + 3600) }), "calendarIntegrations/alice")));
  });
  it("프리미엄이어도 남의 문서는 못 읽는다", async () => {
    await assertFails(getDoc(doc(dbAs(env, "bob", premium()), "calendarIntegrations/alice")));
  });
});

describe("userSettings", () => {
  const ref = (uid: string | null, path = "userSettings/alice") => doc(dbAs(env, uid), path);

  it("본인은 허용된 분 단위 값을 쓴다", async () => {
    await assertSucceeds(setDoc(ref("alice"), { reminderDefaultOffsetMinutes: 30 }));
  });
  it('본인은 "off"를 쓴다', async () => {
    await assertSucceeds(setDoc(ref("alice"), { reminderDefaultOffsetMinutes: "off" }));
  });
  it("목록에 없는 값은 거부된다", async () => {
    await assertFails(setDoc(ref("alice"), { reminderDefaultOffsetMinutes: 15 }));
  });
  it("다른 키를 함께 쓰면 거부된다", async () => {
    await assertFails(setDoc(ref("alice"), { reminderDefaultOffsetMinutes: 30, plan: "premium" }));
  });
  it("남의 설정은 못 쓴다", async () => {
    await assertFails(setDoc(ref("bob"), { reminderDefaultOffsetMinutes: 30 }));
  });
  it("본인은 읽고 지우며, 남은 못 읽는다", async () => {
    await seed(env, "userSettings/alice", { reminderDefaultOffsetMinutes: 60 });
    await assertFails(getDoc(ref("bob")));
    await assertSucceeds(getDoc(ref("alice")));
    await assertSucceeds(deleteDoc(ref("alice")));
  });
});

describe("entitlements", () => {
  beforeEach(async () => {
    await seed(env, "entitlements/alice", { plan: "free" });
  });

  it("본인은 읽는다", async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, "alice"), "entitlements/alice")));
  });
  it("남은 못 읽는다", async () => {
    await assertFails(getDoc(doc(dbAs(env, "bob"), "entitlements/alice")));
  });
  it("본인도 직접 쓸 수 없다(스스로 premium 승격 차단)", async () => {
    await assertFails(setDoc(doc(dbAs(env, "alice"), "entitlements/alice"), { plan: "premium" }));
  });
});

describe("서버 전용 컬렉션", () => {
  for (const col of ["storeLinks", "trialHistory"]) {
    it(`${col}은 누구도 읽거나 쓸 수 없다`, async () => {
      await seed(env, `${col}/k1`, { userId: "alice" });
      const db = dbAs(env, "alice", OPERATOR);
      await assertFails(getDoc(doc(db, `${col}/k1`)));
      await assertFails(setDoc(doc(db, `${col}/k2`), { userId: "alice" }));
    });
  }
});

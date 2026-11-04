import { describe, it, expect, vi } from "vitest";
import { ClaimsClient, UserNotFoundError } from "../claims";

const getToken = async () => "access-token";
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const BASE = "https://identitytoolkit.googleapis.com/v1/projects/proj";

describe("ClaimsClient.setPremiumUntil", () => {
  it("기존 클레임을 보존하고 premium 키는 지운 뒤 premiumUntil을 쓴다", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ users: [{ localId: "u1", customAttributes: '{"premium":true,"admin":true}' }] }))
      .mockResolvedValueOnce(jsonRes({ localId: "u1" }));

    await new ClaimsClient("proj", getToken, fetchFn).setPremiumUntil("u1", 1_800_000_000);

    const [lookupUrl, lookupInit] = fetchFn.mock.calls[0];
    expect(lookupUrl).toBe(`${BASE}/accounts:lookup`);
    expect(JSON.parse(lookupInit.body)).toEqual({ localId: ["u1"] });

    const [updateUrl, updateInit] = fetchFn.mock.calls[1];
    expect(updateUrl).toBe(`${BASE}/accounts:update`);
    const body = JSON.parse(updateInit.body);
    expect(body.localId).toBe("u1");
    expect(JSON.parse(body.customAttributes)).toEqual({ admin: true, premiumUntil: 1_800_000_000 });
  });

  it("커스텀 클레임이 없던 사용자도 처리한다", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ users: [{ localId: "u1" }] }))
      .mockResolvedValueOnce(jsonRes({ localId: "u1" }));
    await new ClaimsClient("proj", getToken, fetchFn).setPremiumUntil("u1", 0);
    expect(JSON.parse(JSON.parse(fetchFn.mock.calls[1][1].body).customAttributes)).toEqual({ premiumUntil: 0 });
  });

  it("사용자가 없으면 UserNotFoundError", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonRes({}));
    await expect(new ClaimsClient("proj", getToken, fetchFn).setPremiumUntil("ghost", 1)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it("update 실패는 던진다", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ users: [{ localId: "u1" }] }))
      .mockResolvedValueOnce(jsonRes({}, 403));
    await expect(new ClaimsClient("proj", getToken, fetchFn).setPremiumUntil("u1", 1)).rejects.toThrow("403");
  });
});

describe("ClaimsClient.deleteUser", () => {
  it("accounts:delete로 사용자를 지운다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await new ClaimsClient("proj", getToken, fetchFn).deleteUser("u1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/accounts:delete`);
    expect(JSON.parse(init.body)).toEqual({ localId: "u1" });
  });

  it("이미 없는 사용자면 성공으로 본다(재시도 멱등)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ error: { message: "USER_NOT_FOUND" } }, 400));
    await expect(new ClaimsClient("proj", getToken, fetchFn).deleteUser("u1")).resolves.toBeUndefined();
  });

  it("그 밖의 실패는 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ error: { message: "INTERNAL" } }, 500));
    await expect(new ClaimsClient("proj", getToken, fetchFn).deleteUser("u1")).rejects.toThrow("Auth 사용자 삭제 실패 (500)");
  });
});

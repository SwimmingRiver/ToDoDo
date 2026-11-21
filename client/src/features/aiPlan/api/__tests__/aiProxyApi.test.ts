import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("VITE_AI_PROXY_URL", "https://ai.example.com");
vi.mock("@/shared/lib/authorizedFetch", () => ({ authorizedFetch: vi.fn() }));

import { authorizedFetch } from "@/shared/lib/authorizedFetch";
const { requestPlan } = await import("../aiProxyApi");

const input = { goal: "이사 준비", dueDate: null, today: "2026-09-25" };
const jsonRes = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("requestPlan", () => {
  beforeEach(() => vi.mocked(authorizedFetch).mockReset());

  it("POST /plan에 JSON 본문을 보내고 결과를 돌려준다", async () => {
    const result = { plan: { title: "t", dueDate: null, items: [] }, usage: { used: 1, limit: 20 } };
    vi.mocked(authorizedFetch).mockResolvedValueOnce(jsonRes(result, 200));
    await expect(requestPlan(input)).resolves.toEqual(result);
    expect(authorizedFetch).toHaveBeenCalledWith("https://ai.example.com", "/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  });
});

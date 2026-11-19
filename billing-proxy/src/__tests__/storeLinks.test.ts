import { describe, it, expect, vi } from "vitest";
import { StoreLinkStore, decideLink, storeLinkId, type StoreLink } from "../storeLinks";

const link = (uid: string): StoreLink => ({ uid, linkedAt: "2026-11-19T00:00:00.000Z", accountToken: "tok" });

describe("decideLink", () => {
  it("no existing + matching token -> link, no mismatch", () => {
    expect(decideLink(null, "u1", "tok", "tok")).toEqual({ kind: "link", tokenMismatch: false });
  });
  it("no existing + mismatched or missing token -> link with tokenMismatch", () => {
    expect(decideLink(null, "u1", "tok", "other")).toEqual({ kind: "link", tokenMismatch: true });
    expect(decideLink(null, "u1", "tok", null)).toEqual({ kind: "link", tokenMismatch: true });
  });
  it("same uid -> relink", () => {
    expect(decideLink(link("u1"), "u1", "tok", "tok")).toEqual({ kind: "relink", tokenMismatch: false });
    expect(decideLink(link("u1"), "u1", "tok", null)).toEqual({ kind: "relink", tokenMismatch: true });
  });
  it("different uid -> conflict", () => {
    expect(decideLink(link("u2"), "u1", "tok", "tok")).toEqual({ kind: "conflict" });
  });
});

describe("storeLinkId", () => {
  it("apple uses the transaction id, google uses sha256 hex of the token", async () => {
    expect(await storeLinkId("apple", "otx_1")).toBe("apple_otx_1");
    expect(await storeLinkId("google", "abc")).toBe(
      "google_ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("StoreLinkStore", () => {
  const getToken = async () => "tok";

  it("get returns null link on 404", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    expect(await new StoreLinkStore("p", getToken, fetchFn).get("apple", "otx_1")).toEqual({ link: null, updateTime: null });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/storeLinks/apple_otx_1",
    );
  });

  it("get decodes the document", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          updateTime: "t1",
          fields: { uid: { stringValue: "u1" }, linkedAt: { stringValue: "x" }, accountToken: { nullValue: null } },
        }),
        { status: 200 },
      ),
    );
    expect(await new StoreLinkStore("p", getToken, fetchFn).get("apple", "otx_1")).toEqual({
      link: { uid: "u1", linkedAt: "x", accountToken: null },
      updateTime: "t1",
    });
  });

  it("put uses exists=false precondition when updateTime null", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await new StoreLinkStore("p", getToken, fetchFn).put("apple", "otx_1", link("u1"), null)).toBe("ok");
    expect(fetchFn.mock.calls[0][0]).toContain("storeLinks/apple_otx_1?currentDocument.exists=false");
    expect(fetchFn.mock.calls[0][1].method).toBe("PATCH");
  });

  it("put uses updateTime precondition and maps precondition failure to conflict", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { status: "FAILED_PRECONDITION" } }), { status: 400 }));
    expect(await new StoreLinkStore("p", getToken, fetchFn).put("google", "t", link("u1"), "2026-01-01T00:00:00Z")).toBe("conflict");
    expect(fetchFn.mock.calls[0][0]).toContain("currentDocument.updateTime=2026-01-01T00%3A00%3A00Z");
  });

  it("put throws on other failures", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    await expect(new StoreLinkStore("p", getToken, fetchFn).put("apple", "o", link("u1"), null)).rejects.toThrow("500");
  });
});

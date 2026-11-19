import { describe, it, expect } from "vitest";
import * as x509 from "@peculiar/x509";
import { verifyAppleJws, AppleJwsError } from "../apple/jws";
import { APPLE_ROOT_CA_G3_DER, APPLE_ROOT_CA_G3_SHA256 } from "../apple/rootCa";
import { makeAppleTestChain, signTestJws, toBase64Url, NOW, VALID_TO } from "./helpers/appleTestChain";

const PAYLOAD = { transactionId: "1000000000000001", productId: "premium_monthly" };

const expectRejected = (promise: Promise<unknown>) => expect(promise).rejects.toBeInstanceOf(AppleJwsError);

describe("verifyAppleJws", () => {
  it("accepts valid chain and returns payload", async () => {
    const chain = await makeAppleTestChain();
    const jws = await signTestJws(PAYLOAD, chain);
    await expect(verifyAppleJws(jws, { trustedRootsDer: [chain.rootDer], now: NOW })).resolves.toEqual(PAYLOAD);
  });

  it("rejects root not in trusted list", async () => {
    const chain = await makeAppleTestChain();
    const jws = await signTestJws(PAYLOAD, chain);
    // 진짜 Apple 루트만 믿으면 스스로 만든 루트로 서명한 체인은 통과하지 못해야 한다.
    await expectRejected(verifyAppleJws(jws, { trustedRootsDer: [APPLE_ROOT_CA_G3_DER], now: NOW }));
    await expectRejected(verifyAppleJws(jws, { trustedRootsDer: [], now: NOW }));
  });

  it("rejects intermediate not signed by root", async () => {
    const chain = await makeAppleTestChain();
    const other = await makeAppleTestChain();
    // 루트는 신뢰 목록과 같지만 중간 인증서는 다른 루트가 발급한 것
    const jws = await signTestJws(PAYLOAD, { ...other, rootDer: chain.rootDer });
    await expectRejected(verifyAppleJws(jws, { trustedRootsDer: [chain.rootDer], now: NOW }));
  });

  it("rejects leaf not signed by intermediate", async () => {
    const chain = await makeAppleTestChain({ leafSignedByStranger: true });
    const jws = await signTestJws(PAYLOAD, chain);
    await expectRejected(verifyAppleJws(jws, { trustedRootsDer: [chain.rootDer], now: NOW }));
  });

  it("rejects expired leaf at now", async () => {
    const chain = await makeAppleTestChain({ leafNotAfter: new Date(NOW.getTime() - 1000) });
    const jws = await signTestJws(PAYLOAD, chain);
    await expectRejected(verifyAppleJws(jws, { trustedRootsDer: [chain.rootDer], now: NOW }));
  });

  it("rejects chain not yet valid or past expiry at now", async () => {
    const chain = await makeAppleTestChain();
    const jws = await signTestJws(PAYLOAD, chain);
    await expectRejected(verifyAppleJws(jws, { trustedRootsDer: [chain.rootDer], now: new Date("2025-12-31T00:00:00Z") }));
    await expectRejected(verifyAppleJws(jws, { trustedRootsDer: [chain.rootDer], now: new Date(VALID_TO.getTime() + 1000) }));
  });

  it("rejects missing Apple OIDs", async () => {
    const noLeafOid = await makeAppleTestChain({ withLeafOid: false });
    await expectRejected(
      verifyAppleJws(await signTestJws(PAYLOAD, noLeafOid), { trustedRootsDer: [noLeafOid.rootDer], now: NOW }),
    );
    const noIntermediateOid = await makeAppleTestChain({ withIntermediateOid: false });
    await expectRejected(
      verifyAppleJws(await signTestJws(PAYLOAD, noIntermediateOid), {
        trustedRootsDer: [noIntermediateOid.rootDer],
        now: NOW,
      }),
    );
  });

  it("rejects tampered payload", async () => {
    const chain = await makeAppleTestChain();
    const [header, , signature] = (await signTestJws(PAYLOAD, chain)).split(".");
    const forged = `${header}.${toBase64Url(JSON.stringify({ ...PAYLOAD, productId: "free" }))}.${signature}`;
    await expectRejected(verifyAppleJws(forged, { trustedRootsDer: [chain.rootDer], now: NOW }));
  });

  it("rejects alg other than ES256", async () => {
    const chain = await makeAppleTestChain();
    for (const alg of ["none", "ES384", "HS256"]) {
      const jws = await signTestJws(PAYLOAD, chain, { alg });
      await expectRejected(verifyAppleJws(jws, { trustedRootsDer: [chain.rootDer], now: NOW }));
    }
  });

  it("rejects x5c that is not exactly three certificates", async () => {
    const chain = await makeAppleTestChain();
    const shapes = [
      [chain.leafDer, chain.rootDer],
      [chain.leafDer, chain.intermediateDer, chain.intermediateDer, chain.rootDer],
    ];
    for (const x5c of shapes) {
      const jws = await signTestJws(PAYLOAD, chain, { x5c });
      await expectRejected(verifyAppleJws(jws, { trustedRootsDer: [chain.rootDer], now: NOW }));
    }
  });

  it("rejects malformed input", async () => {
    const chain = await makeAppleTestChain();
    const opts = { trustedRootsDer: [chain.rootDer], now: NOW };
    await expectRejected(verifyAppleJws("", opts));
    await expectRejected(verifyAppleJws("a.b", opts));
    await expectRejected(verifyAppleJws("!!!.###.$$$", opts));
    const [header, payload] = (await signTestJws(PAYLOAD, chain)).split(".");
    await expectRejected(verifyAppleJws(`${header}.${payload}.`, opts));
  });
});

describe("APPLE_ROOT_CA_G3_DER", () => {
  it("matches the published SHA-256 fingerprint", async () => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", APPLE_ROOT_CA_G3_DER));
    const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe(APPLE_ROOT_CA_G3_SHA256);
    expect(APPLE_ROOT_CA_G3_SHA256).toBe("63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179");
  });

  it("parses as the Apple Root CA - G3 certificate", () => {
    const cert = new x509.X509Certificate(APPLE_ROOT_CA_G3_DER);
    expect(cert.subjectName.getField("CN")).toEqual(["Apple Root CA - G3"]);
  });
});

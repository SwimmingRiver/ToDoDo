import * as x509 from "@peculiar/x509";

/**
 * App Store가 서명한 JWS(signedTransactionInfo·signedRenewalInfo·알림 signedPayload)를 검증한다.
 *
 * 이 검증을 통과한 내용만 프리미엄 판단에 쓰므로, 하나라도 어긋나면 내용을 보지 않고 거절한다.
 *  1. 헤더 alg는 ES256만, x5c는 정확히 [리프, 중간, 루트] 3개만 받는다.
 *  2. 루트는 신뢰 목록과 DER 바이트가 같아야 한다(서명자가 붙여 보낸 루트를 믿지 않기 위해).
 *  3. 중간은 루트 키로, 리프는 중간 키로 서명이 맞아야 한다.
 *  4. 세 인증서 모두 now 시점에 유효기간 안이어야 한다.
 *  5. Apple이 붙이는 표시 확장이 있어야 한다(리프: App Store 영수증 서명, 중간: WWDR 중간 CA).
 *     같은 루트가 다른 용도로 발급한 인증서로 서명한 JWS를 막는다.
 *  6. 마지막으로 리프 공개키로 JWS 서명을 확인한다.
 */

const LEAF_OID = "1.2.840.113635.100.6.11.1";
const INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";
const ES256 = { name: "ECDSA", hash: "SHA-256" } as const;

// Workers·Node 모두 전역 WebCrypto가 있다. 라이브러리가 기본값을 못 잡는 환경에 대비해 명시한다.
x509.cryptoProvider.set(crypto);

export class AppleJwsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleJwsError";
  }
}

const decodeBase64 = (value: string): Uint8Array => {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    throw new AppleJwsError("base64 디코드 실패");
  }
};

const decodeBase64Url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new AppleJwsError("base64url 형식이 아님");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return decodeBase64(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
};

const parseJson = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new AppleJwsError("JSON 파싱 실패");
  }
};

const parseCert = (der: Uint8Array): x509.X509Certificate => {
  try {
    return new x509.X509Certificate(der);
  } catch {
    throw new AppleJwsError("인증서 파싱 실패");
  }
};

const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

const isValidAt = (cert: x509.X509Certificate, now: Date) =>
  cert.notBefore.getTime() <= now.getTime() && now.getTime() <= cert.notAfter.getTime();

const isSignedBy = async (cert: x509.X509Certificate, issuer: x509.X509Certificate) => {
  try {
    // 기간 확인은 직접 now로 하므로 여기서는 서명만 본다.
    return await cert.verify({ publicKey: issuer.publicKey, signatureOnly: true });
  } catch {
    return false;
  }
};

export const verifyAppleJws = async <T>(
  jws: string,
  opts: { trustedRootsDer: Uint8Array[]; now: Date },
): Promise<T> => {
  const parts = typeof jws === "string" ? jws.split(".") : [];
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new AppleJwsError("JWS 형식이 아님");
  }
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = parseJson(decodeBase64Url(headerPart)) as { alg?: unknown; x5c?: unknown } | null;
  if (!header || typeof header !== "object") throw new AppleJwsError("헤더가 객체가 아님");
  if (header.alg !== "ES256") throw new AppleJwsError("ES256이 아닌 alg");
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((entry) => typeof entry === "string")) {
    throw new AppleJwsError("x5c는 인증서 3개여야 함");
  }

  const [leafDer, intermediateDer, rootDer] = (x5c as string[]).map(decodeBase64);
  if (!opts.trustedRootsDer.some((trusted) => bytesEqual(trusted, rootDer))) {
    throw new AppleJwsError("신뢰하지 않는 루트");
  }
  const [leaf, intermediate, root] = [leafDer, intermediateDer, rootDer].map(parseCert);

  if (!(await isSignedBy(intermediate, root))) throw new AppleJwsError("중간 인증서 서명 불일치");
  if (!(await isSignedBy(leaf, intermediate))) throw new AppleJwsError("리프 인증서 서명 불일치");
  if (![leaf, intermediate, root].every((cert) => isValidAt(cert, opts.now))) {
    throw new AppleJwsError("유효기간 밖의 인증서");
  }
  if (!leaf.getExtension(LEAF_OID)) throw new AppleJwsError("리프에 Apple 확장 없음");
  if (!intermediate.getExtension(INTERMEDIATE_OID)) throw new AppleJwsError("중간에 Apple 확장 없음");

  // JWS ES256 서명은 raw r||s 64바이트로, WebCrypto ECDSA가 받는 형식과 같다.
  const signature = decodeBase64Url(signaturePart);
  if (signature.length !== 64) throw new AppleJwsError("서명 길이가 64바이트가 아님");
  let leafKey: CryptoKey;
  try {
    leafKey = await leaf.publicKey.export({ name: "ECDSA", namedCurve: "P-256" }, ["verify"]);
  } catch {
    throw new AppleJwsError("리프 키가 P-256 ECDSA가 아님");
  }
  const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  if (!(await crypto.subtle.verify(ES256, leafKey, signature, signingInput))) {
    throw new AppleJwsError("JWS 서명 불일치");
  }

  return parseJson(decodeBase64Url(payloadPart)) as T;
};

import * as x509 from "@peculiar/x509";

/**
 * Apple 인증서 체인을 흉내 낸 테스트용 루트·중간·리프(P-256)와 그 리프 키로 서명한 JWS를 만든다.
 * 실제 Apple 키는 가질 수 없으므로 신뢰 목록에 이 테스트 루트를 넣어 검증 로직만 시험한다.
 */

const ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const;
const SIGNING = { name: "ECDSA", hash: "SHA-256" } as const;
const LEAF_OID = "1.2.840.113635.100.6.11.1";
const INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";

export const VALID_FROM = new Date("2026-01-01T00:00:00Z");
export const VALID_TO = new Date("2027-01-01T00:00:00Z");
/** 체인이 유효한 기간 안의 기준 시각 */
export const NOW = new Date("2026-06-01T00:00:00Z");

const generateKeys = () => crypto.subtle.generateKey(ALG, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;

/** Apple 인증서처럼 값이 ASN.1 NULL(05 00)인 표시용 확장 */
const marker = (oid: string) => new x509.Extension(oid, false, new Uint8Array([0x05, 0x00]));

export interface TestChainOptions {
  leafNotAfter?: Date;
  withLeafOid?: boolean;
  withIntermediateOid?: boolean;
  /** true면 리프를 중간 인증서가 아닌 다른 키로 서명한다(발급자 이름은 그대로) */
  leafSignedByStranger?: boolean;
}

export interface TestChain {
  rootDer: Uint8Array;
  intermediateDer: Uint8Array;
  leafDer: Uint8Array;
  leafKey: CryptoKey;
}

export const makeAppleTestChain = async (options: TestChainOptions = {}): Promise<TestChain> => {
  const rootKeys = await generateKeys();
  const intermediateKeys = await generateKeys();
  const leafKeys = await generateKeys();
  const strangerKeys = await generateKeys();

  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Test Root CA",
    notBefore: VALID_FROM,
    notAfter: VALID_TO,
    keys: rootKeys,
    signingAlgorithm: SIGNING,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  const intermediate = await x509.X509CertificateGenerator.create({
    serialNumber: "02",
    subject: "CN=Test Intermediate CA",
    issuer: root.subject,
    notBefore: VALID_FROM,
    notAfter: VALID_TO,
    publicKey: intermediateKeys.publicKey,
    signingKey: rootKeys.privateKey,
    signingAlgorithm: SIGNING,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      ...(options.withIntermediateOid === false ? [] : [marker(INTERMEDIATE_OID)]),
    ],
  });
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: "03",
    subject: "CN=Test Leaf",
    issuer: intermediate.subject,
    notBefore: VALID_FROM,
    notAfter: options.leafNotAfter ?? VALID_TO,
    publicKey: leafKeys.publicKey,
    signingKey: options.leafSignedByStranger ? strangerKeys.privateKey : intermediateKeys.privateKey,
    signingAlgorithm: SIGNING,
    extensions: options.withLeafOid === false ? [] : [marker(LEAF_OID)],
  });

  return {
    rootDer: new Uint8Array(root.rawData),
    intermediateDer: new Uint8Array(intermediate.rawData),
    leafDer: new Uint8Array(leaf.rawData),
    leafKey: leafKeys.privateKey,
  };
};

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const toBase64Url = (input: string | Uint8Array) =>
  toBase64(typeof input === "string" ? new TextEncoder().encode(input) : input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export interface SignOptions {
  alg?: string;
  /** 기본은 [리프, 중간, 루트] */
  x5c?: Uint8Array[];
}

/** WebCrypto ECDSA 서명은 JWS와 같은 raw r||s 64바이트라 그대로 붙인다. */
export const signTestJws = async (payload: unknown, chain: TestChain, options: SignOptions = {}) => {
  const header = {
    alg: options.alg ?? "ES256",
    x5c: (options.x5c ?? [chain.leafDer, chain.intermediateDer, chain.rootDer]).map(toBase64),
  };
  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(SIGNING, chain.leafKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
};

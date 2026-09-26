import { describe, it, expect } from "vitest";
import { isAllowedOrigin } from "../corsOrigin";

const env = { CLIENT_APP_URL: "https://app.example.com", FIREBASE_PROJECT_ID: "tododo-test" };

describe("isAllowedOrigin", () => {
  it("CLIENT_APP_URL과 정확히 같은 origin을 허용한다", () => {
    expect(isAllowedOrigin("https://app.example.com", env)).toBe(true);
  });
  it("프로젝트의 firebaseapp.com 기본 도메인을 허용한다", () => {
    expect(isAllowedOrigin("https://tododo-test.firebaseapp.com", env)).toBe(true);
  });
  it("localhost·127.0.0.1은 포트와 무관하게 허용한다", () => {
    expect(isAllowedOrigin("http://localhost:5174", env)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000", env)).toBe(true);
  });
  it("origin이 없거나 목록 밖이면 거부한다", () => {
    expect(isAllowedOrigin(null, env)).toBe(false);
    expect(isAllowedOrigin("https://evil.example.com", env)).toBe(false);
    expect(isAllowedOrigin("https://app.example.com.evil.com", env)).toBe(false);
  });
});

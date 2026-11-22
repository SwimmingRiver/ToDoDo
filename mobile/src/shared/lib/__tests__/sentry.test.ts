import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { ErrorEvent } from "@sentry/react-native";
import { initSentry, reportError, scrubEvent } from "../sentry";

const sentry = jest.requireMock("@sentry/react-native") as {
  init: jest.Mock;
  captureException: jest.Mock;
};

const g = globalThis as unknown as { __DEV__: boolean };

describe("scrubEvent", () => {
  it("허용 필드만 남기고 extra·user.email·contexts.device는 버린다", () => {
    const out = scrubEvent({
      type: undefined,
      event_id: "e1",
      message: "m",
      level: "error",
      release: "r",
      dist: "1",
      exception: { values: [{ type: "Error", value: "boom" }] },
      extra: { todo: { title: "비밀" } },
      user: { id: "u1", email: "a@b.c" },
      contexts: {
        os: { name: "iOS" },
        app: { app_version: "1.0.0" },
        device: { model: "iPhone18,1" },
        todo: { title: "비밀" },
      },
    } as ErrorEvent);

    expect(out.extra).toBeUndefined();
    expect(out.user).toEqual({ id: "u1" });
    expect(out.contexts).toEqual({ os: { name: "iOS" }, app: { app_version: "1.0.0" }, react: undefined });
    expect(out.release).toBe("r");
    expect(out.dist).toBe("1");
    expect(out.exception).toEqual({ values: [{ type: "Error", value: "boom" }] });
    expect(JSON.stringify(out)).not.toContain("비밀");
    expect(JSON.stringify(out)).not.toContain("iPhone18,1");
  });

  it("breadcrumb은 navigation/fetch/xhr만, url 쿼리 제거, message 제거", () => {
    const out = scrubEvent({
      type: undefined,
      breadcrumbs: [
        { category: "fetch", message: "x", data: { url: "https://a.dev/p?token=1", method: "POST", body: "비밀" } },
        { category: "touch", message: "할 일 제목" },
        { category: "console", message: "비밀" },
        { category: "navigation", data: { from: "Home", to: "TodoDetail" } },
      ],
    } as ErrorEvent);

    expect(out.breadcrumbs).toHaveLength(2);
    expect(out.breadcrumbs?.[0]).toMatchObject({ category: "fetch", data: { url: "https://a.dev/p", method: "POST" } });
    expect(out.breadcrumbs?.[0].message).toBeUndefined();
    expect(out.breadcrumbs?.[0].data).not.toHaveProperty("body");
    expect(out.breadcrumbs?.[1]).toMatchObject({ category: "navigation", data: { from: "Home", to: "TodoDetail" } });
  });

  it("request는 보내지 않는다", () => {
    const out = scrubEvent({ type: undefined, request: { url: "x", data: "비밀" } } as ErrorEvent);
    expect(out.request).toBeUndefined();
  });
});

describe("initSentry", () => {
  const originalDev = g.__DEV__;
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    sentry.init.mockClear();
  });
  afterEach(() => {
    g.__DEV__ = originalDev;
    if (originalDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    else process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  });

  it("__DEV__에서는 DSN이 있어도 init하지 않는다", () => {
    g.__DEV__ = true;
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://k@o0.ingest.sentry.io/0";
    initSentry();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("DSN이 없으면 init하지 않는다", () => {
    g.__DEV__ = false;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    initSentry();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("운영+DSN이면 sendDefaultPii:false로 init하고 beforeSend가 스크러빙한다", () => {
    g.__DEV__ = false;
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://k@o0.ingest.sentry.io/0";
    initSentry();

    expect(sentry.init).toHaveBeenCalledTimes(1);
    const options = sentry.init.mock.calls[0][0] as {
      dsn: string;
      sendDefaultPii: boolean;
      beforeSend: (e: ErrorEvent) => ErrorEvent;
    };
    expect(options.dsn).toBe("https://k@o0.ingest.sentry.io/0");
    expect(options.sendDefaultPii).toBe(false);
    const sent = options.beforeSend({ type: undefined, extra: { title: "비밀" }, message: "m" } as ErrorEvent);
    expect(sent.extra).toBeUndefined();
    expect(sent.message).toBe("m");
  });
});

describe("reportError", () => {
  let warn: ReturnType<typeof jest.spyOn>;
  beforeEach(() => {
    sentry.captureException.mockReset();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("console.warn을 남기고 feature 태그로 captureException한다", () => {
    const error = new Error("x");
    reportError(error, "iap");
    expect(warn).toHaveBeenCalledWith("[iap]", error);
    expect(sentry.captureException).toHaveBeenCalledWith(error, { tags: { feature: "iap" } });
  });

  it("feature가 없으면 태그 없이 보고한다", () => {
    const error = new Error("x");
    reportError(error);
    expect(warn).toHaveBeenCalledWith("[error]", error);
    expect(sentry.captureException).toHaveBeenCalledWith(error, undefined);
  });

  it("captureException이 던져도 reportError는 던지지 않는다", () => {
    sentry.captureException.mockImplementation(() => {
      throw new Error("sdk");
    });
    expect(() => reportError(new Error("x"), "calendar")).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

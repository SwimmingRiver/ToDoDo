import { describe, it, expect } from "vitest";
import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";
import { preloadableLazy } from "../preloadableLazy";

const Page = ({ label }: { label: string }) => <p>{label}</p>;
const load = () => Promise.resolve({ default: Page });

describe("preloadableLazy", () => {
  // React.lazy는 모듈이 이미 받아져 있어도 첫 렌더에서 한 번 suspend한다. 그러면 fallback이
  // 커밋되고, React 19는 마지막 fallback 커밋 뒤 300ms(FALLBACK_THROTTLE_MS)가 지나야 내용을
  // 보여 준다. 운영 트레이스에서 로그인 응답 → 첫 화면 사이 ~300ms 공백의 원인이었다.
  it("미리 받아 둔 모듈은 첫 렌더에서 suspend하지 않고 바로 그린다", async () => {
    const { Component, preload } = preloadableLazy(load);
    await preload();

    render(
      <Suspense fallback={<p>로딩</p>}>
        <Component label="오늘 화면" />
      </Suspense>,
    );

    // 첫 커밋에 바로 내용이 있어야 한다(fallback을 거치지 않음).
    expect(screen.getByText("오늘 화면")).toBeInTheDocument();
    expect(screen.queryByText("로딩")).not.toBeInTheDocument();
  });

  it("아직 안 받은 모듈은 기존 lazy처럼 fallback 뒤 내용을 그린다", async () => {
    const { Component } = preloadableLazy(load);

    render(
      <Suspense fallback={<p>로딩</p>}>
        <Component label="목록 화면" />
      </Suspense>,
    );

    expect(screen.getByText("로딩")).toBeInTheDocument();
    expect(await screen.findByText("목록 화면")).toBeInTheDocument();
  });

  it("preload는 같은 다운로드를 재사용하고, 실패하면 다음 호출에서 다시 시도한다", async () => {
    let calls = 0;
    let fail = true;
    const flaky = () => {
      calls += 1;
      return fail
        ? Promise.reject(new Error("chunk"))
        : Promise.resolve({ default: Page });
    };
    const { preload } = preloadableLazy(flaky);

    await expect(preload()).rejects.toThrow("chunk");
    fail = false;
    await act(async () => {
      await Promise.all([preload(), preload()]);
    });
    expect(calls).toBe(2);
  });
});

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import useElementWidth from "../useElementWidth";

type ResizeCallback = (entries: { contentRect: { width: number } }[]) => void;
let lastCallback: ResizeCallback | null = null;

const Probe = () => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  return <div ref={ref} data-testid="probe">{width}</div>;
};

describe("useElementWidth", () => {
  beforeAll(() => {
    // jsdom에는 ResizeObserver가 없다
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeCallback) {
        lastCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    lastCallback = null;
  });

  it("마운트 시 getBoundingClientRect 너비로 초기화한다", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 240 } as DOMRect);
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("240");
  });

  it("ResizeObserver 콜백이 오면 너비를 갱신한다", () => {
    render(<Probe />);
    act(() => {
      lastCallback?.([{ contentRect: { width: 512 } }]);
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("512");
  });

  it("대상 요소가 나중에 마운트되어도 그 시점에 너비를 측정한다", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 300 } as DOMRect);
    const LateProbe = ({ show }: { show: boolean }) => {
      const { ref, width } = useElementWidth<HTMLDivElement>();
      return (
        <div>
          <span data-testid="width">{width}</span>
          {show && <div ref={ref} />}
        </div>
      );
    };
    const { rerender } = render(<LateProbe show={false} />);
    expect(screen.getByTestId("width")).toHaveTextContent("0");
    rerender(<LateProbe show />);
    expect(screen.getByTestId("width")).toHaveTextContent("300");
  });
});

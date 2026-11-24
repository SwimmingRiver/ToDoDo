import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FeedbackAdminPage from "../feedbackAdminPage";

const m = vi.hoisted(() => ({
  listFeedback: vi.fn(),
  updateFeedbackStatus: vi.fn(),
  useIsOperator: vi.fn(),
}));

vi.mock("../../api/feedbackAdminApi", async (orig) => ({
  ...(await orig<typeof import("../../api/feedbackAdminApi")>()),
  listFeedback: m.listFeedback,
  updateFeedbackStatus: m.updateFeedbackStatus,
}));
vi.mock("../../hooks/useIsOperator", () => ({ useIsOperator: m.useIsOperator }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: null } }));

const items = [
  { id: "a", email: "a@x.com", content: "새 내용입니다", createdAt: "2026-11-01T03:04:00.000Z", platform: "ios", status: "new" },
  { id: "b", email: null, content: "반영된 내용", createdAt: "2026-11-02T03:04:00.000Z", platform: "web", status: "done" },
];

// 기대 문자열은 로컬 getter로 만든다(UTC 리터럴이면 시간대에 따라 날짜가 달라짐).
const pad = (n: number) => String(n).padStart(2, "0");
const expectedLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/admin/feedback"]}>
        <Routes>
          <Route path="/admin/feedback" element={<FeedbackAdminPage />} />
          <Route path="/today" element={<div>오늘 화면</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("FeedbackAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.listFeedback.mockResolvedValue({ items, nextCursor: null });
    m.updateFeedbackStatus.mockResolvedValue(undefined);
    m.useIsOperator.mockReturnValue({ isOperator: true, isLoading: false });
  });

  it("권한 확인 중에는 조회하지 않는다", () => {
    m.useIsOperator.mockReturnValue({ isOperator: false, isLoading: true });
    renderPage();
    expect(m.listFeedback).not.toHaveBeenCalled();
    expect(screen.queryByText("오늘 화면")).toBeNull();
  });

  it("운영자가 아니면 /today로 이동하고 조회하지 않는다", () => {
    m.useIsOperator.mockReturnValue({ isOperator: false, isLoading: false });
    renderPage();
    expect(screen.getByText("오늘 화면")).toBeTruthy();
    expect(m.listFeedback).not.toHaveBeenCalled();
  });

  it("기본 필터 새 의견: 항목 정보를 표시한다", async () => {
    renderPage();
    expect(await screen.findByText("새 내용입니다")).toBeTruthy();
    expect(screen.getByText("a@x.com")).toBeTruthy();
    expect(screen.getByText("ios")).toBeTruthy();
    expect(screen.getByText(expectedLocal(items[0].createdAt))).toBeTruthy();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("new");
    expect(screen.queryByText("반영된 내용")).toBeNull();
  });

  it("필터 전환은 재조회 없이 화면에서 처리하고 이메일 없음을 표시한다", async () => {
    renderPage();
    await screen.findByText("새 내용입니다");
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(screen.getByText("반영된 내용")).toBeTruthy();
    expect(screen.getByText("이메일 없음")).toBeTruthy();
    expect(m.listFeedback).toHaveBeenCalledTimes(1);
  });

  it("상태 select 변경 시 updateFeedbackStatus를 호출한다", async () => {
    renderPage();
    await screen.findByText("새 내용입니다");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "planned" } });
    await waitFor(() => expect(m.updateFeedbackStatus).toHaveBeenCalledWith("a", "planned"));
  });

  it("목록이 비면 안내 문구를 표시한다", async () => {
    m.listFeedback.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("의견이 없습니다")).toBeTruthy();
  });

  it("목록 조회가 실패하면 오류 안내를 표시하고 빈 목록 문구는 숨긴다", async () => {
    m.listFeedback.mockRejectedValue(new Error("permission-denied"));
    renderPage();
    expect(
      await screen.findByText("의견을 불러오지 못했습니다. 다시 로그인하거나 잠시 후 새로고침해 주세요."),
    ).toBeTruthy();
    expect(screen.queryByText("의견이 없습니다")).toBeNull();
  });

  it("상태 변경이 실패하면 항목 아래에 안내를 표시하고 다음 시도 때 지운다", async () => {
    m.updateFeedbackStatus.mockRejectedValueOnce(new Error("fail"));
    renderPage();
    await screen.findByText("새 내용입니다");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "planned" } });
    expect(await screen.findByText("상태를 바꾸지 못했습니다")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "done" } });
    await waitFor(() => expect(screen.queryByText("상태를 바꾸지 못했습니다")).toBeNull());
  });

  it("처음 불러오는 동안 불러오는 중 문구를 표시한다", async () => {
    m.listFeedback.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(await screen.findByText("불러오는 중…")).toBeTruthy();
    expect(screen.queryByText("의견이 없습니다")).toBeNull();
  });

  it("다음 페이지가 있으면 더 보기 버튼으로 이어서 불러온다", async () => {
    m.listFeedback
      .mockResolvedValueOnce({ items, nextCursor: "2026-11-01T03:04:00.000Z" })
      .mockResolvedValueOnce({
        items: [{ ...items[0], id: "c", content: "옛날 새 의견" }],
        nextCursor: null,
      });
    renderPage();
    await screen.findByText("새 내용입니다");
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByText("옛날 새 의견")).toBeTruthy();
    expect(m.listFeedback).toHaveBeenLastCalledWith("2026-11-01T03:04:00.000Z");
    await waitFor(() => expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull());
  });

  it("다음 페이지가 없으면 더 보기 버튼이 없다", async () => {
    renderPage();
    await screen.findByText("새 내용입니다");
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
  });
});

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
    m.listFeedback.mockResolvedValue(items);
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
    expect(screen.getByText(/2026\.11\.01 \d{2}:\d{2}/)).toBeTruthy();
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
    m.listFeedback.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("의견이 없습니다")).toBeTruthy();
  });
});

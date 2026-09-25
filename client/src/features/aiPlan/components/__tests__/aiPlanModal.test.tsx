import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AiPlanError } from "../../api";

vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "u" } }, googleProvider: {} }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("@/features/entitlement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/entitlement")>()),
  useIsPremium: vi.fn(),
}));
vi.mock("@/features/feedback/hooks", () => ({ useSubmitFeedback: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) }));

const { generateMutate, createMutate, toastError, toastSuccess, state } = vi.hoisted(() => ({
  generateMutate: vi.fn(),
  createMutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  state: { generatePending: false, createPending: false },
}));
vi.mock("../../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks")>()),
  useGeneratePlan: () => ({ mutate: generateMutate, isPending: state.generatePending }),
}));
vi.mock("@/features/todo/hooks", () => ({
  useCreatePlanTodos: () => ({ mutate: createMutate, isPending: state.createPending }),
}));
vi.mock("@/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared")>()),
  useToast: () => ({ error: toastError, success: toastSuccess }),
}));

import { useIsPremium } from "@/features/entitlement";
import AiPlanModal from "../aiPlanModal";

const plan = {
  title: "이사 준비",
  dueDate: "2026-10-31",
  items: [
    { title: "견적 받기", dueDate: "2026-10-03", priority: "high" as const },
    { title: "짐 정리", dueDate: null, priority: "low" as const },
  ],
};
const result = { plan, usage: { used: 3, limit: 20 } };

const renderModal = (onClose = vi.fn()) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  );
  render(<AiPlanModal onClose={onClose} />, { wrapper });
  return { onClose };
};

// 실제 useMutation은 onSuccess/onError 뒤에 항상 onSettled를 호출한다. mock도 이를
// 맞춰야 컴포넌트의 in-flight ref 가드(onSettled에서 플래그를 내림)가 다음 호출을
// 막지 않는다.
const goToPreview = () => {
  generateMutate.mockImplementationOnce((_input, { onSuccess, onSettled }) => {
    onSuccess(result);
    onSettled?.();
  });
  fireEvent.change(screen.getByLabelText("목표"), { target: { value: "다음 달 이사 준비" } });
  fireEvent.click(screen.getByRole("button", { name: "계획 만들기" }));
};

describe("AiPlanModal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 25, 10));
    vi.clearAllMocks();
    state.generatePending = false;
    state.createPending = false;
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: true, isLoading: false });
  });
  afterEach(() => vi.useRealTimers());

  it("무료 사용자에게는 잠금 안내를 보여주고 입력칸은 없다", () => {
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: false, isLoading: false });
    renderModal();
    expect(screen.getByText("AI 할 일 플랜은 프리미엄 기능입니다")).toBeInTheDocument();
    expect(screen.queryByLabelText("목표")).not.toBeInTheDocument();
  });

  it("목표가 공백이면 계획 만들기가 비활성, 입력하면 오늘 날짜와 함께 요청한다", () => {
    renderModal();
    const submit = screen.getByRole("button", { name: "계획 만들기" });
    fireEvent.change(screen.getByLabelText("목표"), { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("목표"), { target: { value: " 이사 준비 " } });
    fireEvent.click(submit);
    expect(generateMutate).toHaveBeenCalledWith(
      { goal: "이사 준비", dueDate: null, today: "2026-09-25" },
      expect.any(Object),
    );
  });

  it("마감일 입력은 오늘보다 이전을 고를 수 없다", () => {
    renderModal();
    expect(screen.getByLabelText("마감일(선택)")).toHaveAttribute("min", "2026-09-25");
  });

  it("요청 중에는 버튼이 잠기고 문구가 바뀌어 더블클릭해도 한 번만 호출된다", () => {
    state.generatePending = true;
    renderModal();
    fireEvent.change(screen.getByLabelText("목표"), { target: { value: "이사" } });
    const busy = screen.getByRole("button", { name: "계획을 짜는 중…" });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    fireEvent.click(busy);
    expect(generateMutate).not.toHaveBeenCalled();
  });

  it("isPending이 아직 false여도 동기 더블클릭하면 ref 가드가 두 번째 호출을 막는다", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("목표"), { target: { value: "이사" } });
    const submit = screen.getByRole("button", { name: "계획 만들기" });
    // generateMutate는 콜백을 호출하지 않으므로 isPending은 계속 false지만, ref 가드가 막는다.
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("저장도 isPending이 false인 동기 더블클릭에서 ref 가드로 한 번만 호출된다", () => {
    renderModal();
    goToPreview();
    const submit = screen.getByRole("button", { name: "2개 추가" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(createMutate).toHaveBeenCalledTimes(1);
  });

  it("생성 중에는 취소·X·배경 클릭이 모두 무시된다(닫기 안 됨)", () => {
    state.generatePending = true;
    const { onClose } = renderModal();

    const cancel = screen.getByRole("button", { name: "취소" });
    expect(cancel).toBeDisabled();
    fireEvent.click(cancel);

    const closeButton = screen.getByRole("button", { name: "모달 닫기" });
    expect(closeButton).toBeDisabled();
    fireEvent.click(closeButton);

    const dialog = screen.getByRole("dialog", { name: "AI로 계획" });
    fireEvent.click(dialog.parentElement as HTMLElement);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("성공하면 미리보기에 상위·하위와 오늘 사용량을 보여준다", () => {
    renderModal();
    goToPreview();
    expect(screen.getByDisplayValue("이사 준비")).toBeInTheDocument();
    expect(screen.getByDisplayValue("견적 받기")).toBeInTheDocument();
    expect(screen.getByText("오늘 3/20회")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2개 추가" })).toBeEnabled();
  });

  it("체크 해제하면 추가 개수가 줄고, 추가 시 체크된 항목만 저장한다", () => {
    const { onClose } = renderModal();
    goToPreview();
    fireEvent.click(screen.getByRole("checkbox", { name: "짐 정리 포함" }));
    createMutate.mockImplementationOnce((_s, { onSuccess, onSettled }) => {
      onSuccess({ parentId: "p", count: 2 });
      onSettled?.();
    });
    fireEvent.click(screen.getByRole("button", { name: "1개 추가" }));
    expect(createMutate).toHaveBeenCalledWith(
      {
        parent: { title: "이사 준비", dueDate: "2026-10-31", priority: "medium" },
        children: [{ title: "견적 받기", dueDate: "2026-10-03", priority: "high" }],
      },
      expect.any(Object),
    );
    // 토스트 개수는 버튼과 같은 값(체크된 하위 개수)을 써야 한다 — 서버가 돌려준
    // count(상위 포함 2)가 아니라 실제로 체크해서 추가한 1개.
    expect(toastSuccess).toHaveBeenCalledWith("계획 추가 완료", "할 일 1개를 추가했어요");
    expect(onClose).toHaveBeenCalled();
  });

  it("직접 추가한 빈 항목이 체크돼 있으면 추가 버튼이 비활성", () => {
    renderModal();
    goToPreview();
    fireEvent.click(screen.getByRole("button", { name: "+ 항목 직접 추가" }));
    expect(screen.getByRole("button", { name: "3개 추가" })).toBeDisabled();
  });

  it("수정 후 닫으려 하면 확인을 받고, 취소하면 그대로 남는다", () => {
    const { onClose } = renderModal();
    goToPreview();
    fireEvent.change(screen.getByDisplayValue("견적 받기"), { target: { value: "견적 5곳" } });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByText("수정한 내용이 사라져요")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("수정 없이 닫으면 확인 없이 닫힌다", () => {
    const { onClose } = renderModal();
    goToPreview();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("다시 만들기는 같은 입력으로 재요청한다(수정했다면 확인 후)", () => {
    renderModal();
    goToPreview();
    fireEvent.click(screen.getByRole("button", { name: "다시 만들기" }));
    expect(generateMutate).toHaveBeenLastCalledWith(
      { goal: "다음 달 이사 준비", dueDate: null, today: "2026-09-25" },
      expect.any(Object),
    );
  });

  it("한도 초과는 에러 토스트, 권한 없음(403)은 잠금 안내로 전환", () => {
    renderModal();
    generateMutate.mockImplementationOnce((_i, { onError, onSettled }) => {
      onError(new AiPlanError("DAILY_LIMIT", 429));
      onSettled?.();
    });
    fireEvent.change(screen.getByLabelText("목표"), { target: { value: "이사" } });
    fireEvent.click(screen.getByRole("button", { name: "계획 만들기" }));
    expect(toastError).toHaveBeenCalledWith("오늘 사용 횟수를 다 썼어요", "내일 다시 시도해 주세요");

    generateMutate.mockImplementationOnce((_i, { onError, onSettled }) => {
      onError(new AiPlanError("PREMIUM_REQUIRED", 403));
      onSettled?.();
    });
    fireEvent.click(screen.getByRole("button", { name: "계획 만들기" }));
    expect(screen.getByText("AI 할 일 플랜은 프리미엄 기능입니다")).toBeInTheDocument();
  });

  it("저장 실패면 에러 토스트를 띄우고 초안을 유지한다", () => {
    const { onClose } = renderModal();
    goToPreview();
    createMutate.mockImplementationOnce((_s, { onError, onSettled }) => {
      onError(new Error("x"));
      onSettled?.();
    });
    fireEvent.click(screen.getByRole("button", { name: "2개 추가" }));
    expect(toastError).toHaveBeenCalledWith("추가하지 못했어요", "잠시 후 다시 시도해 주세요");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("견적 받기")).toBeInTheDocument();
  });
});

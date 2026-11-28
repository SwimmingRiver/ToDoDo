import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchEmptyState } from "../searchEmptyState";

describe("SearchEmptyState 버튼 이름", () => {
  it("검색어만 있으면 '검색 취소'", () => {
    render(<SearchEmptyState query="회의" onCancelSearch={vi.fn()} />);
    expect(screen.getByRole("button", { name: "검색 취소" })).toBeInTheDocument();
  });

  it("검색어와 칩이 함께 있으면 '필터 해제'", () => {
    const onCancel = vi.fn();
    render(<SearchEmptyState query="회의" hasPriorityFilter onCancelSearch={onCancel} />);
    expect(screen.queryByRole("button", { name: "검색 취소" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 해제" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("칩만 있으면 '필터 해제'", () => {
    render(<SearchEmptyState query="" hasPriorityFilter onCancelSearch={vi.fn()} />);
    expect(screen.getByRole("button", { name: "필터 해제" })).toBeInTheDocument();
  });
});

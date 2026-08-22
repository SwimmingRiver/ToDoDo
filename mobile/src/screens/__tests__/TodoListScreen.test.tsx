import { render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../hooks/useTodos", () => ({
  useTodos: () => ({
    isLoading: false,
    data: [
      { id: "todo-1", title: "루트 할 일", parentId: null, status: "todo" },
      { id: "todo-2", title: "하위 할 일", parentId: "todo-1", status: "todo" },
    ],
  }),
}));

describe("TodoListScreen", () => {
  it("루트와 하위 할 일 제목을 모두 렌더링한다", async () => {
    const { TodoListScreen } = await import("../TodoListScreen");
    await render(<TodoListScreen />);

    expect(screen.getByText("루트 할 일")).toBeTruthy();
    expect(screen.getByText("하위 할 일")).toBeTruthy();
  });
});

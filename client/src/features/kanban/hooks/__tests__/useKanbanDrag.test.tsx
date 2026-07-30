import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { DragStartEvent, DragEndEvent, Active, Over } from "@dnd-kit/core";
import { useKanbanDrag } from "../useKanbanDrag";
import type { Todo } from "@/features/todo";

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "test-user-id",
  title: "테스트 할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

// dnd-kit의 Active/Over는 실제 드래그 시 라이브러리 내부에서 rect, data 등을
// 채워 넣지만, useKanbanDrag는 event.active.id / event.over.id만 읽으므로
// 테스트에서는 그 외 필드를 최소한으로만 채운 목 객체로 충분하다.
const makeActive = (id: string): Active =>
  ({ id, data: { current: undefined }, rect: { current: { initial: null, translated: null } } }) as unknown as Active;

const makeOver = (id: string): Over =>
  ({ id, disabled: false, data: { current: undefined }, rect: {} }) as unknown as Over;

const makeDragStartEvent = (activeId: string): DragStartEvent =>
  ({ active: makeActive(activeId), activatorEvent: new Event("pointerdown") }) as unknown as DragStartEvent;

const makeDragEndEvent = (activeId: string, overId: string | null): DragEndEvent =>
  ({
    active: makeActive(activeId),
    over: overId === null ? null : makeOver(overId),
    activatorEvent: new Event("pointerup"),
    collisions: null,
    delta: { x: 0, y: 0 },
  }) as unknown as DragEndEvent;

describe("useKanbanDrag", () => {
  describe("드래그 시작/종료 시 activeId 상태 관리", () => {
    it("드래그 시작 시 activeId와 activeTodo가 설정된다", () => {
      const todos = [makeTodo({ id: "todo-1" }), makeTodo({ id: "todo-2" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragStart(makeDragStartEvent("todo-1"));
      });

      expect(result.current.activeId).toBe("todo-1");
      expect(result.current.activeTodo?.id).toBe("todo-1");
    });

    it("드래그 종료 시 activeId가 null로 초기화된다", () => {
      const todos = [makeTodo({ id: "todo-1", status: "todo" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragStart(makeDragStartEvent("todo-1"));
      });
      expect(result.current.activeId).toBe("todo-1");

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "doing"));
      });

      expect(result.current.activeId).toBeNull();
      expect(result.current.activeTodo).toBeUndefined();
    });
  });

  describe("컬럼 간 상태 전이", () => {
    it("todo 카드를 doing 컬럼(빈 컬럼)에 드롭하면 status가 doing으로 바뀐다", () => {
      // 대상 컬럼이 비어 있으면 dnd-kit이 카드가 아닌 컬럼(SortableContext id)
      // 자체를 over로 준다 — over.id가 곧 컬럼의 status 값이다.
      const todos = [makeTodo({ id: "todo-1", status: "todo" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "doing"));
      });

      expect(onUpdateTodo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "todo-1", status: "doing" }),
      );
    });

    it("todo 카드를 doing 컬럼의 기존 카드 위에 드롭해도 status가 doing으로 바뀐다", () => {
      // 대상 컬럼에 카드가 있으면 over.id는 그 카드의 id이므로, 그 카드의
      // status를 목표 상태로 사용해야 한다.
      const todos = [
        makeTodo({ id: "todo-1", status: "todo" }),
        makeTodo({ id: "todo-2", status: "doing" }),
      ];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "todo-2"));
      });

      expect(onUpdateTodo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "todo-1", status: "doing" }),
      );
    });

    it("doing 카드를 done 컬럼으로 옮기면 status가 done으로 바뀐다", () => {
      const todos = [makeTodo({ id: "todo-1", status: "doing" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "done"));
      });

      expect(onUpdateTodo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "todo-1", status: "done" }),
      );
    });

    it("done 카드를 todo 컬럼으로 되돌리면 status가 todo로 바뀐다", () => {
      const todos = [makeTodo({ id: "todo-1", status: "done" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "todo"));
      });

      expect(onUpdateTodo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "todo-1", status: "todo" }),
      );
    });

    it("드롭된 카드 외의 다른 필드는 변경하지 않고 status만 바뀐 새 객체를 전달한다", () => {
      const original = makeTodo({
        id: "todo-1",
        status: "todo",
        title: "원본 제목",
        priority: "high",
        order: 3,
      });
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() =>
        useKanbanDrag({ todos: [original], onUpdateTodo }),
      );

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "doing"));
      });

      expect(onUpdateTodo).toHaveBeenCalledWith({
        ...original,
        status: "doing",
      });
    });
  });

  describe("같은 컬럼 내 재정렬(같은 status로 드롭)", () => {
    it("같은 컬럼 안의 다른 카드 위에 드롭하면(status 변화 없음) onUpdateTodo가 호출되지 않는다", () => {
      // useKanbanDrag는 카드 순서(order)를 재계산하지 않고 컬럼 간 status 전이만
      // 처리한다. 드롭 대상 카드의 status가 드래그한 카드와 같으면(=같은 컬럼 내
      // 재정렬) 아무 것도 변경하지 않는다 — 현재 구현에서는 같은 컬럼 내 순서가
      // 서버에 반영되지 않는다.
      const todos = [
        makeTodo({ id: "todo-1", status: "todo", order: 0 }),
        makeTodo({ id: "todo-2", status: "todo", order: 1 }),
      ];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "todo-2"));
      });

      expect(onUpdateTodo).not.toHaveBeenCalled();
    });

    it("같은 컬럼(빈 자리 포함)에 드롭해도 status가 같으면 onUpdateTodo가 호출되지 않는다", () => {
      const todos = [makeTodo({ id: "todo-1", status: "todo" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "todo"));
      });

      expect(onUpdateTodo).not.toHaveBeenCalled();
    });
  });

  describe("엣지 케이스", () => {
    it("드롭 가능한 영역 밖(over === null)에 놓으면 아무 것도 변경되지 않는다", () => {
      const todos = [makeTodo({ id: "todo-1", status: "todo" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", null));
      });

      expect(onUpdateTodo).not.toHaveBeenCalled();
      expect(result.current.activeId).toBeNull();
    });

    it("todos가 undefined(로딩 중)여도 에러 없이 처리되고 onUpdateTodo가 호출되지 않는다", () => {
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() =>
        useKanbanDrag({ todos: undefined, onUpdateTodo }),
      );

      expect(() => {
        act(() => {
          result.current.handleDragEnd(makeDragEndEvent("todo-1", "doing"));
        });
      }).not.toThrow();

      expect(onUpdateTodo).not.toHaveBeenCalled();
    });

    it("드래그 시작 후 목록에서 사라진 카드(낙관적 업데이트 등)를 드롭해도 안전하게 무시된다", () => {
      const onUpdateTodo = vi.fn();
      const { result, rerender } = renderHook(
        ({ todos }) => useKanbanDrag({ todos, onUpdateTodo }),
        { initialProps: { todos: [makeTodo({ id: "todo-1", status: "todo" })] } },
      );

      act(() => {
        result.current.handleDragStart(makeDragStartEvent("todo-1"));
      });

      // 드래그 도중 목록에서 해당 카드가 사라짐(예: 다른 클라이언트의 삭제)
      rerender({ todos: [] });

      expect(() => {
        act(() => {
          result.current.handleDragEnd(makeDragEndEvent("todo-1", "doing"));
        });
      }).not.toThrow();

      expect(onUpdateTodo).not.toHaveBeenCalled();
      expect(result.current.activeId).toBeNull();
    });

    it("빈 컬럼의 status id로 바로 드롭해도(over가 카드가 아닌 컬럼 자체) 상태가 바뀐다", () => {
      const todos = [
        makeTodo({ id: "todo-1", status: "doing" }),
        // done 컬럼은 비어 있음
      ];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "done"));
      });

      expect(onUpdateTodo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "todo-1", status: "done" }),
      );
    });

    it("존재하지 않는 카드 id로 드래그 종료가 발생해도 안전하게 무시된다", () => {
      const todos = [makeTodo({ id: "todo-1", status: "todo" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("nonexistent-id", "doing"));
      });

      expect(onUpdateTodo).not.toHaveBeenCalled();
    });
  });

  describe("센서 구성", () => {
    it("PointerSensor, TouchSensor, KeyboardSensor 3개의 센서가 구성된다", () => {
      const { result } = renderHook(() =>
        useKanbanDrag({ todos: [], onUpdateTodo: vi.fn() }),
      );

      expect(result.current.sensors).toHaveLength(3);
    });
  });
});

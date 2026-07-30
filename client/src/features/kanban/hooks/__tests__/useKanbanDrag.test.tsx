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
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }));

      act(() => {
        result.current.handleDragStart(makeDragStartEvent("todo-1"));
      });

      expect(result.current.activeId).toBe("todo-1");
      expect(result.current.activeTodo?.id).toBe("todo-1");
    });

    it("드래그 종료 시 activeId가 null로 초기화된다", () => {
      const todos = [makeTodo({ id: "todo-1", status: "todo" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }));

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
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }));

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
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }));

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
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }));

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
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }));

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
        useKanbanDrag({ todos: [original], onUpdateTodo, onReorderTodos: vi.fn() }),
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
    // onReorderTodos는 allTodos(status 풀 전체, 반복 인스턴스로 숨겨진 형제 포함)를
    // 기준으로 arrayMove 후 order가 실제로 바뀐 문서만 diff해서 전달한다 — 컬럼 전체를
    // 매번 다시 쓰지 않는다(비용 검토 결과 반영).
    it("같은 컬럼 안의 다른 카드 위에 드롭하면 onUpdateTodo는 호출되지 않고, 두 카드의 order만 바뀐 diff로 onReorderTodos가 호출된다", () => {
      const todos = [
        makeTodo({ id: "todo-1", status: "todo", order: 0 }),
        makeTodo({ id: "todo-2", status: "todo", order: 1 }),
      ];
      const onUpdateTodo = vi.fn();
      const onReorderTodos = vi.fn();
      const { result } = renderHook(() =>
        useKanbanDrag({ todos, onUpdateTodo, onReorderTodos }),
      );

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "todo-2"));
      });

      expect(onUpdateTodo).not.toHaveBeenCalled();
      expect(onReorderTodos).toHaveBeenCalledTimes(1);
      const updates = onReorderTodos.mock.calls[0][0];
      expect(updates).toHaveLength(2);
      expect(updates).toEqual(
        expect.arrayContaining([
          { id: "todo-1", order: 1 },
          { id: "todo-2", order: 0 },
        ]),
      );
    });

    it("같은 카드 위에 그대로 드롭하면(순서 변화 없음) onReorderTodos가 호출되지 않는다", () => {
      const todos = [
        makeTodo({ id: "todo-1", status: "todo", order: 0 }),
        makeTodo({ id: "todo-2", status: "todo", order: 1 }),
      ];
      const onUpdateTodo = vi.fn();
      const onReorderTodos = vi.fn();
      const { result } = renderHook(() =>
        useKanbanDrag({ todos, onUpdateTodo, onReorderTodos }),
      );

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "todo-1"));
      });

      expect(onUpdateTodo).not.toHaveBeenCalled();
      expect(onReorderTodos).not.toHaveBeenCalled();
    });

    it("카드가 하나뿐인 컬럼의 빈 영역(컬럼 자체 id)에 드롭해도 순서 변화가 없으므로 onReorderTodos가 호출되지 않는다", () => {
      const todos = [makeTodo({ id: "todo-1", status: "todo", order: 0 })];
      const onUpdateTodo = vi.fn();
      const onReorderTodos = vi.fn();
      const { result } = renderHook(() =>
        useKanbanDrag({ todos, onUpdateTodo, onReorderTodos }),
      );

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "todo"));
      });

      expect(onUpdateTodo).not.toHaveBeenCalled();
      expect(onReorderTodos).not.toHaveBeenCalled();
    });

    it("컬럼 빈 영역(컬럼 자체 id)에 드롭하면 맨 끝으로 이동한 것으로 간주해 order를 재계산한다", () => {
      const todos = [
        makeTodo({ id: "todo-1", status: "todo", order: 0 }),
        makeTodo({ id: "todo-2", status: "todo", order: 1 }),
        makeTodo({ id: "todo-3", status: "todo", order: 2 }),
      ];
      const onUpdateTodo = vi.fn();
      const onReorderTodos = vi.fn();
      const { result } = renderHook(() =>
        useKanbanDrag({ todos, onUpdateTodo, onReorderTodos }),
      );

      // todo-1을 컬럼 빈 영역(over.id === "todo" 상태 id)에 드롭 → 맨 끝으로 이동
      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "todo"));
      });

      const updates = onReorderTodos.mock.calls[0][0];
      expect(updates).toHaveLength(3);
      expect(updates).toEqual(
        expect.arrayContaining([
          { id: "todo-1", order: 2 },
          { id: "todo-2", order: 0 },
          { id: "todo-3", order: 1 },
        ]),
      );
    });

    it("다른 컬럼(status)에 드롭하면 재정렬이 아니라 기존 status 전이(onUpdateTodo)로만 처리된다", () => {
      const todos = [
        makeTodo({ id: "todo-1", status: "todo", order: 0 }),
        makeTodo({ id: "todo-2", status: "doing", order: 0 }),
      ];
      const onUpdateTodo = vi.fn();
      const onReorderTodos = vi.fn();
      const { result } = renderHook(() =>
        useKanbanDrag({ todos, onUpdateTodo, onReorderTodos }),
      );

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", "todo-2"));
      });

      expect(onUpdateTodo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "todo-1", status: "doing" }),
      );
      expect(onReorderTodos).not.toHaveBeenCalled();
    });

    it("화면에 숨겨진 반복 인스턴스 형제(같은 status, 다른 recurrenceId 인스턴스)가 있어도 allTodos 기준으로 order를 재계산해 형제와의 상대 순서를 보존한다", () => {
      // 시나리오: 같은 recurrenceId를 가진 반복 인스턴스 두 개(overdue-1, overdue-2)가
      // 둘 다 status:"todo"라서 collapseRecurringInstances가 dueAt이 이른 overdue-1만
      // 대표로 노출하고 overdue-2는 화면에서 숨긴다. useKanbanDrag는 컬럼에 실제로
      // 렌더링되는 대표 카드만이 아니라 allTodos(todos prop, 숨은 형제 포함)를 기준으로
      // 재인덱싱해야 overdue-2가 나중에 대표로 떠오를 때도 상대 순서가 어긋나지 않는다.
      const todos = [
        makeTodo({ id: "overdue-1", status: "todo", order: 0, recurrenceId: "series-1", dueAt: "2026-07-28T00:00:00.000Z" }),
        makeTodo({ id: "overdue-2", status: "todo", order: 1, recurrenceId: "series-1", dueAt: "2026-07-29T00:00:00.000Z" }),
        makeTodo({ id: "todo-solo", status: "todo", order: 2 }),
      ];
      const onUpdateTodo = vi.fn();
      const onReorderTodos = vi.fn();
      const { result } = renderHook(() =>
        useKanbanDrag({ todos, onUpdateTodo, onReorderTodos }),
      );

      // 화면에는 overdue-1(대표)과 todo-solo만 카드로 보이고, 사용자가 todo-solo를
      // overdue-1 앞으로 드래그했다고 가정 — over는 여전히 실제 문서 id(overdue-1)다.
      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-solo", "overdue-1"));
      });

      // allTodos 기준 배열 [overdue-1(0), overdue-2(1), todo-solo(2)]에서
      // todo-solo(index 2)를 overdue-1(index 0) 위치로 옮기면
      // [todo-solo, overdue-1, overdue-2] → order 0,1,2로 재부여된다.
      // 숨겨진 overdue-2도 함께 재번호되어(1→2) 상대 순서(overdue-1 다음)가 보존된다.
      const updates = onReorderTodos.mock.calls[0][0];
      expect(updates).toHaveLength(3);
      expect(updates).toEqual(
        expect.arrayContaining([
          { id: "todo-solo", order: 0 },
          { id: "overdue-1", order: 1 },
          { id: "overdue-2", order: 2 },
        ]),
      );
    });
  });

  describe("엣지 케이스", () => {
    it("드롭 가능한 영역 밖(over === null)에 놓으면 아무 것도 변경되지 않는다", () => {
      const todos = [makeTodo({ id: "todo-1", status: "todo" })];
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("todo-1", null));
      });

      expect(onUpdateTodo).not.toHaveBeenCalled();
      expect(result.current.activeId).toBeNull();
    });

    it("todos가 undefined(로딩 중)여도 에러 없이 처리되고 onUpdateTodo가 호출되지 않는다", () => {
      const onUpdateTodo = vi.fn();
      const { result } = renderHook(() =>
        useKanbanDrag({ todos: undefined, onUpdateTodo, onReorderTodos: vi.fn() }),
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
        ({ todos }) => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }),
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
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }));

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
      const { result } = renderHook(() => useKanbanDrag({ todos, onUpdateTodo, onReorderTodos: vi.fn() }));

      act(() => {
        result.current.handleDragEnd(makeDragEndEvent("nonexistent-id", "doing"));
      });

      expect(onUpdateTodo).not.toHaveBeenCalled();
    });
  });

  describe("센서 구성", () => {
    it("PointerSensor, TouchSensor, KeyboardSensor 3개의 센서가 구성된다", () => {
      const { result } = renderHook(() =>
        useKanbanDrag({ todos: [], onUpdateTodo: vi.fn(), onReorderTodos: vi.fn() }),
      );

      expect(result.current.sensors).toHaveLength(3);
    });
  });
});

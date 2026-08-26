import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AlertCircle, ClipboardList, Plus } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useTodos } from "../hooks/useTodos";
import { useDeleteTodo } from "../hooks/useDeleteTodo";
import { useUpdateTodo } from "../hooks/useUpdateTodo";
import { ProjectCard } from "../shared/ui/projectCard/ProjectCard";
import { EmptyState } from "../shared/ui/emptyState/EmptyState";
import { ListSkeleton } from "../shared/ui/skeleton/ListSkeleton";
import { BottomSheet, type BottomSheetOption } from "../shared/ui/bottomSheet/BottomSheet";
import { colors } from "../theme/colors";
import { type Status } from "../theme/statusColors";
import { spacing } from "../theme/spacing";
import {
  collapseRecurringInstances,
  getProjectOverdue,
  getProjectProgress,
  getProjectSubtaskInfo,
  getRecurringMissedCount,
  type ProjectCardData,
} from "../shared/utils/projectUtils";

// 기준 소스: client/src/features/todo/components/todoList.tsx + projectCard.tsx +
// childTodoCard.tsx + utils/projectUtils.ts (design/spec.md "### 2. TodoListScreen" 절).
// 이전 버전이 참고했던 todoListItem.tsx는 어디서도 렌더링되지 않는 죽은 코드였다.

const STATUS_OPTIONS: BottomSheetOption<Status>[] = [
  { value: "todo", label: "할 일" },
  { value: "doing", label: "진행 중" },
  { value: "done", label: "완료" },
];

export const TodoListScreen = () => {
  const { data: todos, isLoading, isError } = useTodos();
  const { mutateAsync: deleteTodoMutateAsync } = useDeleteTodo();
  const { mutate: updateTodoMutate, isPending: isTogglingStatus } = useUpdateTodo();
  const [statusSheetTodo, setStatusSheetTodo] = useState<Todo | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const allTodos = useMemo(() => todos ?? [], [todos]);

  // 루트 필터링(status !== "done") + 반복 대표 1건 축약(collapseRecurringInstances) —
  // 웹 todoList.tsx의 todoTree/projectCards 파생과 동일한 규칙. 자식은 done이어도
  // 계속 보인다(자식 필터링 없음).
  const projectCards = useMemo<ProjectCardData[]>(() => {
    const rootTodos = allTodos.filter((todo) => todo.parentId === null);
    const activatedRoots = rootTodos.filter((todo) => todo.status !== "done");
    const collapsedRoots = collapseRecurringInstances(activatedRoots);

    return collapsedRoots.map((root) => ({
      todo: root,
      childTodos: allTodos.filter((todo) => todo.parentId === root.id),
      progress: getProjectProgress(allTodos, root.id),
      subtaskInfo: getProjectSubtaskInfo(allTodos, root.id),
      overdueInfo: getProjectOverdue(allTodos, root),
      recurringMissedCount: getRecurringMissedCount(allTodos, root),
    }));
  }, [allTodos]);

  const handleOpenStatusSheet = (todo: Todo) => {
    if (isTogglingStatus) return;
    setStatusSheetTodo(todo);
  };

  const handleSelectStatus = (status: Status) => {
    if (!statusSheetTodo) return;
    updateTodoMutate({
      id: statusSheetTodo.id,
      fields: { status, doneAt: status === "done" ? new Date().toISOString() : null },
    });
  };

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteConfirmed = async (todo: Todo) => {
    try {
      setDeleteErrors((prev) => {
        if (!(todo.id in prev)) return prev;
        const next = { ...prev };
        delete next[todo.id];
        return next;
      });
      await deleteTodoMutateAsync(todo.id);
    } catch (e) {
      setDeleteErrors((prev) => ({
        ...prev,
        [todo.id]: e instanceof Error ? e.message : "삭제에 실패했습니다",
      }));
    }
  };

  // 루트(프로젝트)/자식(할 일) 모두 이 함수 하나로 처리한다 — 웹처럼 삭제 확인 자체를
  // 별도 모달로 구현하지 않고, 기존 모바일 관례(Alert.alert)를 그대로 유지한다
  // (design/spec.md "의사결정 확정" 3번).
  const handleDeleteRequest = (id: string) => {
    const todo = allTodos.find((t) => t.id === id);
    if (!todo) return;

    const isRoot = todo.parentId === null;
    Alert.alert(
      isRoot ? "프로젝트 삭제" : "할 일 삭제",
      isRoot
        ? "하위 할 일도 함께 삭제됩니다. 삭제하시겠습니까?"
        : `"${todo.title}"을(를) 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: () => handleDeleteConfirmed(todo) },
      ],
    );
  };

  const handleOpenDetail = (todo: Todo) => {
    navigation.navigate("TodoDetail", { id: todo.id });
  };

  const handleAddChild = (parentId: string) => {
    navigation.navigate("TodoForm", { parentId });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <ListSkeleton count={5} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <EmptyState
          icon={AlertCircle}
          title="할 일을 불러오지 못했습니다"
          description="네트워크 연결을 확인하고 다시 시도해주세요"
        />
      </SafeAreaView>
    );
  }

  // 빈 상태 판정은 allTodos.length가 아니라 필터링·반복 축약을 마친 뒤의 프로젝트
  // 카드 개수 기준이어야 한다 — 루트가 전부 done이면 allTodos는 비어있지 않아도
  // 화면에 보일 카드는 0개다(design/spec.md "빈 상태 판정 정정" 절).
  const isEmpty = projectCards.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      {isEmpty ? (
        <EmptyState
          icon={ClipboardList}
          title="할 일이 없습니다"
          description="새로운 할 일을 추가하고 생산적인 하루를 시작해보세요!"
          actionLabel="새 할일 추가"
          onAction={() => navigation.navigate("TodoForm")}
        />
      ) : (
        // 프로젝트 개수가 많지 않고(가상화로 얻는 이점이 작음), 펼치기 토글처럼
        // projectCards 배열 자체와 무관한 상태 변화를 카드별로 반영해야 해서
        // FlatList 대신 단순한 ScrollView + map을 쓴다. FlatList/VirtualizedList는
        // data 배열의 참조가 바뀌지 않으면 renderItem 클로저가 바뀌어도 셀을 다시
        // 그리지 않는(extraData로만 우회 가능한) 잘 알려진 함정이 있다.
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={styles.countText}>프로젝트 {projectCards.length}개</Text>
          {projectCards.map((card) => (
            <ProjectCard
              key={card.todo.id}
              data={card}
              isExpanded={expandedIds.has(card.todo.id)}
              onToggleExpand={handleToggleExpand}
              onOpenDetail={handleOpenDetail}
              onOpenStatusSheet={handleOpenStatusSheet}
              onDelete={handleDeleteRequest}
              onEditChild={handleOpenDetail}
              onAddChild={handleAddChild}
              error={deleteErrors[card.todo.id]}
              childErrors={deleteErrors}
            />
          ))}
        </ScrollView>
      )}

      <Pressable
        onPress={() => navigation.navigate("TodoForm")}
        accessibilityRole="button"
        accessibilityLabel="할 일 추가"
        style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
      >
        <Plus size={16} color={colors.background.primary} />
        <Text style={styles.addButtonText}>할 일 추가</Text>
      </Pressable>

      <BottomSheet
        isOpen={statusSheetTodo !== null}
        onClose={() => setStatusSheetTodo(null)}
        title="상태 선택"
        options={STATUS_OPTIONS}
        selectedValue={statusSheetTodo?.status}
        onSelect={handleSelectStatus}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  countText: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
  },
  addButton: {
    minHeight: 48,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand.strong,
    borderRadius: 10,
  },
  addButtonPressed: {
    backgroundColor: colors.brand.strongHover,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.background.primary,
  },
});

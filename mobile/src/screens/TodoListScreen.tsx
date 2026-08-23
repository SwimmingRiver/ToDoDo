import { useState } from "react";
import { ActivityIndicator, Alert, Button, FlatList, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { Todo } from "@tododo/core";
import { useTodos } from "../hooks/useTodos";
import { useDeleteTodo } from "../hooks/useDeleteTodo";
import { useUpdateTodo } from "../hooks/useUpdateTodo";

const nextStatus: Record<Todo["status"], Todo["status"]> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

const priorityLabel: Record<Todo["priority"], string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

const TodoRow = ({
  todo,
  onDelete,
  onToggleStatus,
  isTogglingStatus,
}: {
  todo: Todo;
  onDelete: (id: string) => Promise<void>;
  onToggleStatus: (todo: Todo) => void;
  isTogglingStatus: boolean;
}) => {
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    try {
      setError(null);
      await onDelete(todo.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다");
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "할 일 삭제",
      "하위 할 일도 함께 삭제됩니다. 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: handleDelete },
      ],
    );
  };

  return (
    <View
      testID={`todo-row-${todo.id}`}
      style={{ paddingVertical: 8, paddingLeft: todo.parentId ? 32 : 16 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable
          testID={`status-toggle-${todo.id}`}
          disabled={isTogglingStatus}
          onPress={() => onToggleStatus(todo)}
        >
          <Text>[{todo.status}]</Text>
        </Pressable>
        <Text style={{ flex: 1, marginLeft: 8 }}>{todo.title}</Text>
        <Text style={{ marginRight: 8 }}>{priorityLabel[todo.priority]}</Text>
        <Button title="삭제" onPress={confirmDelete} />
      </View>
      {error && <Text style={{ color: "red" }}>{error}</Text>}
    </View>
  );
};

// order는 형제 그룹(루트끼리, 각 부모의 자식끼리)별로 독립적인 값이라 전역 정렬로는
// 하위 할 일이 엉뚱한 부모 밑에 붙어 보일 수 있다. 루트를 먼저 순서대로 나열하고,
// 각 루트 바로 뒤에 그 자식들을 순서대로 이어 붙여 부모-자식이 항상 인접하게 한다.
const groupByParent = (todos: Todo[]): Todo[] => {
  const roots = todos.filter((todo) => todo.parentId === null);
  return roots.flatMap((root) => [
    root,
    ...todos.filter((todo) => todo.parentId === root.id),
  ]);
};

export const TodoListScreen = () => {
  const { data: todos, isLoading, isError } = useTodos();
  const { mutateAsync: deleteTodo } = useDeleteTodo();
  const { mutate: updateTodo, isPending: isTogglingStatus } = useUpdateTodo();
  const navigation = useNavigation();

  const handleToggleStatus = (todo: Todo) => {
    if (isTogglingStatus) return;
    const status = nextStatus[todo.status];
    updateTodo({
      id: todo.id,
      fields: { status, doneAt: status === "done" ? new Date().toISOString() : null },
    });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>할 일을 불러오지 못했습니다</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Button title="할 일 추가" onPress={() => navigation.navigate("TodoForm" as never)} />
      <FlatList
        data={groupByParent(todos ?? [])}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TodoRow
            todo={item}
            onDelete={deleteTodo}
            onToggleStatus={handleToggleStatus}
            isTogglingStatus={isTogglingStatus}
          />
        )}
      />
    </View>
  );
};

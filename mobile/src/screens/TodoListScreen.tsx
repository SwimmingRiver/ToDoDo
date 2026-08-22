import { ActivityIndicator, FlatList, Text, View } from "react-native";
import type { Todo } from "@tododo/core";
import { useTodos } from "../hooks/useTodos";

const TodoRow = ({ todo }: { todo: Todo }) => (
  <View
    testID={`todo-row-${todo.id}`}
    style={{ paddingVertical: 8, paddingLeft: todo.parentId ? 32 : 16 }}
  >
    <Text>{todo.title}</Text>
  </View>
);

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
    <FlatList
      data={groupByParent(todos ?? [])}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TodoRow todo={item} />}
    />
  );
};

import { ActivityIndicator, FlatList, Text, View } from "react-native";
import type { Todo } from "@tododo/core";
import { useTodos } from "../hooks/useTodos";

const TodoRow = ({ todo }: { todo: Todo }) => (
  <View style={{ paddingVertical: 8, paddingLeft: todo.parentId ? 32 : 16 }}>
    <Text>{todo.title}</Text>
  </View>
);

export const TodoListScreen = () => {
  const { data: todos, isLoading } = useTodos();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={todos ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TodoRow todo={item} />}
    />
  );
};

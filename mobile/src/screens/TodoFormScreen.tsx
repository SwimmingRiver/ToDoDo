import { useState } from "react";
import { Button, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useCreateTodo } from "../hooks/useCreateTodo";

export const TodoFormScreen = () => {
  const [title, setTitle] = useState("");
  const navigation = useNavigation();
  const { mutate, isPending } = useCreateTodo();

  const handleSubmit = () => {
    if (!title.trim()) return;
    mutate(
      { title, priority: "medium", startAt: null, dueAt: null, parentId: null, order: 0 },
      { onSuccess: () => navigation.goBack() },
    );
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="할 일 제목"
        style={{ borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 4 }}
      />
      <Button title="추가" onPress={handleSubmit} disabled={isPending} />
    </View>
  );
};

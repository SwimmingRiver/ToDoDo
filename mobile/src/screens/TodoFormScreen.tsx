import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useCreateTodo } from "../hooks/useCreateTodo";

export const TodoFormScreen = () => {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();
  const { mutateAsync, isPending } = useCreateTodo();

  const handleSubmit = async () => {
    if (!title.trim()) return;
    try {
      setError(null);
      await mutateAsync({
        title,
        priority: "medium",
        startAt: null,
        dueAt: null,
        parentId: null,
        order: 0,
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "할 일 추가에 실패했습니다");
    }
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
      {error && <Text style={{ color: "red" }}>{error}</Text>}
    </View>
  );
};

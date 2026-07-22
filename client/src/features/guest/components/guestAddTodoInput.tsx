import { useState } from "react";
import { Plus } from "lucide-react";
import { Form, Input, AddButton } from "./guestAddTodoInput.styles";

const MAX_TITLE_LENGTH = 100;

interface GuestAddTodoInputProps {
  onAdd: (title: string) => void;
}

const GuestAddTodoInput = ({ onAdd }: GuestAddTodoInputProps) => {
  const [title, setTitle] = useState("");
  const isEmpty = title.trim() === "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmpty) return;
    onAdd(title);
    setTitle("");
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="할 일을 입력하세요"
        maxLength={MAX_TITLE_LENGTH}
        aria-label="할 일 제목 입력"
      />
      <AddButton type="submit" disabled={isEmpty} aria-label="할 일 추가">
        <Plus size={16} aria-hidden="true" />
        추가
      </AddButton>
    </Form>
  );
};

export default GuestAddTodoInput;

interface Todo {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high";
  startAt: string | null;
  dueAt: string | null;
  doneAt: string | null;
  parentId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** 생성 시 클라이언트가 채우는 부분집합. status/doneAt/timestamps는 서버 쪽(todoApi)이 채운다. */
interface TodoFields {
  title: string;
  description?: string;
  priority: Todo["priority"];
  startAt: string | null;
  dueAt: string | null;
  parentId: string | null;
  order: number;
}

export type { Todo, TodoFields };

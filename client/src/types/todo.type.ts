interface Todo {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "doing" | "done";
  createdAt: string;
  updatedAt: string;
  startAt: string | null;
  dueAt: string | null;
  doneAt: string;
  priority: "low" | "medium" | "high";
  parentId: string | null;
  order: number;
}

export type { Todo };

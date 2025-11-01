export class CreateTodoListDto {
  title: string;
  description?: string;
  status?: 'todo' | 'doing' | 'done';
  createdAt?: string;
  updatedAt?: string;
  startAt?: string | null;
  dueAt?: string;
  doneAt?: string;
  priority?: 'low' | 'medium' | 'high';
  parentId?: string | null;
  order?: number;
}

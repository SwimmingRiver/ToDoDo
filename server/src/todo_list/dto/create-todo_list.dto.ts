export class CreateTodoListDto {
  title: string;
  description?: string;
  status?: 'todo' | 'doing' | 'done';
  startAt?: string | null;
  dueAt?: string | null;
  doneAt?: string | null;
  priority?: 'low' | 'medium' | 'high';
  parentId?: string | null;
  order?: number;
}

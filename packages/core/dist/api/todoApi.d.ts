import { type Firestore } from "firebase/firestore";
import type { Todo, TodoFields } from "../types/todo";
export declare const getTodos: (db: Firestore, userId: string) => Promise<Todo[]>;
export declare const createTodo: (db: Firestore, userId: string, fields: TodoFields) => Promise<string>;
type TodoUpdateFields = Partial<TodoFields> & {
    status?: Todo["status"];
    doneAt?: string | null;
};
/**
 * 웹(client/src/features/todo/api/todoApi.ts의 editTodo)과 동일한 부모-자식
 * 캐스케이드를 모바일에도 적용한다. 이게 없으면 모바일에서 부모만 done으로
 * 바꿔도 자식은 그대로 남아, 30일 아카이빙 스윕이 미완료 자식을 놓치는
 * 문제가 생긴다.
 */
export declare const updateTodo: (db: Firestore, id: string, fields: TodoUpdateFields, allTodos: Todo[]) => Promise<void>;
export declare const deleteTodo: (db: Firestore, id: string) => Promise<void>;
export {};

import { type Firestore } from "firebase/firestore";
import type { Todo, TodoFields } from "../types/todo";
export declare const getTodos: (db: Firestore, userId: string) => Promise<Todo[]>;
export declare const createTodo: (db: Firestore, userId: string, fields: TodoFields) => Promise<string>;
type TodoUpdateFields = Partial<TodoFields> & {
    status?: Todo["status"];
    doneAt?: string | null;
};
export declare const updateTodo: (db: Firestore, id: string, fields: TodoUpdateFields) => Promise<void>;
export declare const deleteTodo: (db: Firestore, id: string) => Promise<void>;
export {};

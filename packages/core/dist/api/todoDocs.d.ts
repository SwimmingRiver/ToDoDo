import { type Firestore } from "firebase/firestore";
import type { Todo } from "../types/todo";
/** Firestore 문서를 Todo로 바꾼다(문서 id를 id 필드로). */
export declare const mapDocToTodo: (id: string, data: Record<string, unknown>) => Todo;
/** 사용자의 루트(parentId === null) 할 일 중 다음에 쓸 order 값을 계산한다. */
export declare const getNextRootOrder: (db: Firestore, userId: string) => Promise<number>;

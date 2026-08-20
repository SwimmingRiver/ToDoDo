import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import type { Todo, TodoFields } from "../types/todo";

const normalizeOrder = (order: number | undefined): number =>
  typeof order === "number" && !Number.isNaN(order) ? order : Infinity;

const mapDocToTodo = (id: string, data: Record<string, unknown>): Todo =>
  ({ id, ...data }) as Todo;

export const getTodos = async (db: Firestore, userId: string): Promise<Todo[]> => {
  const q = query(
    collection(db, "todos"),
    where("userId", "==", userId),
    where("archived", "==", false),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => mapDocToTodo(d.id, d.data()))
    .sort((a, b) => normalizeOrder(a.order) - normalizeOrder(b.order));
};

export const createTodo = async (
  db: Firestore,
  userId: string,
  fields: TodoFields,
): Promise<string> => {
  const now = new Date().toISOString();
  const docRef = await addDoc(collection(db, "todos"), {
    ...fields,
    userId,
    status: "todo",
    doneAt: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
};

type TodoUpdateFields = Partial<TodoFields> & {
  status?: Todo["status"];
  doneAt?: string | null;
};

export const updateTodo = async (
  db: Firestore,
  id: string,
  fields: TodoUpdateFields,
): Promise<void> => {
  await updateDoc(doc(db, "todos", id), {
    ...fields,
    updatedAt: new Date().toISOString(),
  });
};

export const deleteTodo = async (db: Firestore, id: string): Promise<void> => {
  await deleteDoc(doc(db, "todos", id));
};

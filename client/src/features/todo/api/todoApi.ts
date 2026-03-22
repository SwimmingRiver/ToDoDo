import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "@/shared/lib/firebase";
import type { Todo } from "../types/todo.type";

const todosRef = collection(db, "todos");

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.uid;
};

const mapDocToTodo = (id: string, data: Record<string, unknown>): Todo =>
  ({ id, ...data }) as Todo;

export const getTodos = async () => {
  const userId = getUserId();
  const q = query(todosRef, where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => mapDocToTodo(doc.id, doc.data()))
    .sort((a, b) => a.order - b.order);
};

export const getTodoDetail = async (id: string) => {
  const snapshot = await getDoc(doc(db, "todos", id));
  if (!snapshot.exists()) throw new Error("Todo not found");
  return mapDocToTodo(snapshot.id, snapshot.data());
};

export const getSearchTodoList = async (queryStr: string) => {
  const todos = await getTodos();
  return todos.filter((todo) =>
    todo.title.toLowerCase().includes(queryStr.toLowerCase()),
  );
};

export const createTodo = async (todo: Todo) => {
  const userId = getUserId();
  const now = new Date().toISOString();
  const { id: _, ...todoData } = todo; // eslint-disable-line @typescript-eslint/no-unused-vars
  const docRef = await addDoc(todosRef, {
    ...todoData,
    userId,
    createdAt: now,
    updatedAt: now,
    parentId: null,
    status: "todo",
  });
  return { ...todo, id: docRef.id };
};

export const editTodo = async (todo: Todo) => {
  const { id, ...data } = todo;
  await updateDoc(doc(db, "todos", id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
  return todo;
};

export const deleteTodo = async (id: string) => {
  await deleteDoc(doc(db, "todos", id));
};

export const updateToDone = async (id: string) => {
  const now = new Date().toISOString();
  const docRef = doc(db, "todos", id);
  await updateDoc(docRef, { status: "done", doneAt: now, updatedAt: now });
  const snapshot = await getDoc(docRef);
  return mapDocToTodo(snapshot.id, snapshot.data()!);
};

export const createChildTodo = async (
  parentId: string,
  todo: Partial<Todo>,
) => {
  const userId = getUserId();
  const now = new Date().toISOString();
  const docRef = await addDoc(todosRef, {
    ...todo,
    parentId,
    userId,
    createdAt: now,
    updatedAt: now,
    status: "todo",
  });
  return { ...todo, id: docRef.id, parentId } as Todo;
};

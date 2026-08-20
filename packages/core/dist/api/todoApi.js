import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, } from "firebase/firestore";
const normalizeOrder = (order) => typeof order === "number" && !Number.isNaN(order) ? order : Infinity;
const mapDocToTodo = (id, data) => ({ id, ...data });
export const getTodos = async (db, userId) => {
    const q = query(collection(db, "todos"), where("userId", "==", userId), where("archived", "==", false));
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((d) => mapDocToTodo(d.id, d.data()))
        .sort((a, b) => normalizeOrder(a.order) - normalizeOrder(b.order));
};
export const createTodo = async (db, userId, fields) => {
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
export const updateTodo = async (db, id, fields) => {
    await updateDoc(doc(db, "todos", id), {
        ...fields,
        updatedAt: new Date().toISOString(),
    });
};
export const deleteTodo = async (db, id) => {
    await deleteDoc(doc(db, "todos", id));
};

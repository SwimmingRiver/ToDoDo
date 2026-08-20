import { collection, addDoc, getDocs, doc, updateDoc, query, where, writeBatch, } from "firebase/firestore";
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
    // 대상이 루트 할 일이면 하위 할 일도 함께 지워야 parentId가 존재하지 않는
    // 문서를 가리키는 고아 문서가 남지 않는다.
    const childrenSnapshot = await getDocs(query(collection(db, "todos"), where("parentId", "==", id)));
    const batch = writeBatch(db);
    batch.delete(doc(db, "todos", id));
    childrenSnapshot.docs.forEach((childDoc) => {
        batch.delete(childDoc.ref);
    });
    await batch.commit();
};

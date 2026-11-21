export const EMPTY_DRAFT = {
    parent: { title: "", dueDate: null, priority: "medium" },
    items: [],
    dirty: false,
    nextKey: 0,
};
const mapItem = (state, key, fn) => ({
    ...state,
    items: state.items.map((item) => (item.key === key ? fn(item) : item)),
    dirty: true,
});
export const planDraftReducer = (state, action) => {
    switch (action.type) {
        case "load":
            return {
                parent: { title: action.plan.title, dueDate: action.plan.dueDate, priority: "medium" },
                items: action.plan.items.map((item, index) => ({ ...item, key: `item-${index}`, checked: true })),
                dirty: false,
                nextKey: action.plan.items.length,
            };
        case "updateParent":
            return { ...state, parent: { ...state.parent, ...action.patch }, dirty: true };
        case "updateItem":
            return mapItem(state, action.key, (item) => ({ ...item, ...action.patch }));
        case "toggleItem":
            return mapItem(state, action.key, (item) => ({ ...item, checked: !item.checked }));
        case "removeItem":
            return { ...state, items: state.items.filter((item) => item.key !== action.key), dirty: true };
        case "addItem":
            return {
                ...state,
                items: [
                    ...state.items,
                    { key: `item-${state.nextKey}`, title: "", dueDate: null, priority: "medium", checked: true },
                ],
                nextKey: state.nextKey + 1,
                dirty: true,
            };
    }
};
export const checkedCount = (draft) => draft.items.filter((item) => item.checked).length;
export const canSubmit = (draft) => {
    const checked = draft.items.filter((item) => item.checked);
    return (draft.parent.title.trim().length > 0 &&
        checked.length > 0 &&
        checked.every((item) => item.title.trim().length > 0));
};
export const toSubmission = (draft) => ({
    parent: { ...draft.parent, title: draft.parent.title.trim() },
    children: draft.items
        .filter((item) => item.checked)
        .map(({ title, dueDate, priority }) => ({ title: title.trim(), dueDate, priority })),
});

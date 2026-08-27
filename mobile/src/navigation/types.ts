export type TodoDetailParams = { id: string };

/** dueAt: 캘린더/오늘 화면에서 특정 날짜를 선택한 채로 추가할 때 그 날짜를 프리필한다. */
export type TodoFormParams = { parentId?: string; dueAt?: string } | undefined;

export type TodayStackParamList = {
  Today: undefined;
  TodoDetail: TodoDetailParams;
  TodoForm: TodoFormParams;
};

export type TodoListStackParamList = {
  TodoList: undefined;
  TodoForm: TodoFormParams;
  TodoDetail: TodoDetailParams;
};

export type CalendarStackParamList = {
  Calendar: undefined;
  TodoDetail: TodoDetailParams;
  TodoForm: TodoFormParams;
};

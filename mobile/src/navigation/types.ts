export type TodoDetailParams = { id: string };

/** dueAt: 캘린더/오늘 화면에서 특정 날짜를 선택한 채로 추가할 때 그 날짜를 프리필한다. */
export type TodoFormParams = { parentId?: string; dueAt?: string } | undefined;

export type TodayStackParamList = {
  Today: undefined;
  Account: undefined;
  Notifications: undefined;
  TodoDetail: TodoDetailParams;
  TodoForm: TodoFormParams;
};

export type TodoListStackParamList = {
  TodoList: undefined;
  AiPlan: undefined;
  Account: undefined;
  Notifications: undefined;
  TodoForm: TodoFormParams;
  TodoDetail: TodoDetailParams;
};

export type CalendarStackParamList = {
  Calendar: undefined;
  Account: undefined;
  Notifications: undefined;
  TodoDetail: TodoDetailParams;
  TodoForm: TodoFormParams;
};

export type InsightsStackParamList = {
  Insights: undefined;
  Account: undefined;
  Notifications: undefined;
};

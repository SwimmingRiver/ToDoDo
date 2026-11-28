import type { ListTab } from "../hooks";

/** 탭이 가리키는 목록 패널의 id. 두 탭이 같은 자리의 패널 하나를 바꿔 보여 준다. */
export const LIST_TAB_PANEL_ID = "todo-list-tabpanel";

/** 탭 버튼의 id(패널의 aria-labelledby에 쓴다). */
export const listTabId = (tab: ListTab) => `todo-list-tab-${tab}`;

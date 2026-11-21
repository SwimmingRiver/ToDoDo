import type { Todo } from "../types/todo.js";
import type { GoogleCalendarEvent } from "./types.js";
/** 읽기 전용으로 겹쳐 보여줄 구글 이벤트. ToDoDo가 이미 만든(googleEventId로
 *  링크된) 이벤트는 같은 Todo가 두 번 보이지 않도록 뺀다. */
export declare const filterUnsyncedEvents: (events: GoogleCalendarEvent[], todos: Todo[]) => GoogleCalendarEvent[];
/**
 * 구글 오버레이 이벤트가 dateKey("yyyy-MM-dd") 날짜에 걸쳐 있는지 판정한다.
 * calendar-proxy Worker는 종일 이벤트를 "yyyy-MM-dd"(end 배타), 시간 이벤트를
 * 오프셋 포함 ISO로 준다. 격자와 목록이 어긋나지 않도록 같은 규칙 — end 배타,
 * 로컬 날짜 기준 — 을 따른다.
 */
export declare const isDateInGoogleEventRange: (dateKey: string, event: {
    start: string;
    end: string;
}) => boolean;
/**
 * 구글 이벤트의 날짜 캡션. 종일이면 "종일", 시간 이벤트는 그날 시작하면 로컬 시각,
 * 전날부터 이어지는 날이면 "전날부터 이어짐" — 시작 시각을 그대로 쓰면 다음 날 목록에
 * "오후 11:30"이 떠서 그날 밤 일정으로 오해된다.
 */
export declare const formatGoogleEventTime: (start: string, dateKey: string) => string;
/** 점 표시용: 이벤트가 걸친 날짜 키를 [rangeStartKey, rangeEndKeyExclusive) 범위로 잘라 반환. */
export declare const getGoogleEventDateKeys: (event: {
    start: string;
    end: string;
}, rangeStartKey: string, rangeEndKeyExclusive: string) => string[];

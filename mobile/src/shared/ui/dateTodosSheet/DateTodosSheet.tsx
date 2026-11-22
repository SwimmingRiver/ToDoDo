import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import type { Todo } from "@tododo/core";
import {
  formatGoogleEventTime,
  type GoogleCalendarEvent,
} from "@tododo/core/dist/calendarSync/index.js";
import { EmptyState } from "../emptyState/EmptyState";
import { Button } from "../button/Button";
import { RecurrenceBadge } from "../recurrenceBadge/RecurrenceBadge";
import { isTodoOverdue } from "../../utils/due";
import { formatRecurrenceSummary } from "../../utils/recurrenceSummary";
import { colors } from "../../../theme/colors";
import { statusColors, type Status } from "../../../theme/statusColors";
import { spacing } from "../../../theme/spacing";

const STATUS_LABEL: Record<Status, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

/** 웹 캘린더 시트의 toLocaleDateString("ko-KR", { month: "short", day: "numeric" })와 같은 "6월 20일". */
const formatMonthDay = (iso: string) => {
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

interface DateTodosSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** formatTodayLabel(selectedDate) 결과, 예: "6월 20일, 토요일". */
  dateLabel: string;
  /** 선택한 날짜 키("yyyy-MM-dd"). 구글 일정 시각 캡션("전날부터 이어짐" 판정)에 쓴다. */
  dateKey?: string | null;
  todos: Todo[];
  /** 이 날짜에 걸친 구글 오버레이 일정(이미 동기화된 것은 제외된 상태). 읽기 전용으로 할 일 아래에 붙는다. */
  googleEvents?: GoogleCalendarEvent[];
  onPressTodo: (todo: Todo) => void;
  onAddTodo: () => void;
}

const SLIDE_DURATION_MS = 250;

/** 시트만 아래에서 올라오고 내려가게 한다. 닫을 때는 내려가는 애니메이션이 끝난 뒤 Modal을
 *  내려야 해서(바로 visible=false면 시트가 툭 사라진다) 마운트 상태를 따로 둔다.
 *
 *  항목·"할 일 추가"를 누르면 부모(CalendarScreen)가 같은 틱에 닫고 화면을 이동한다. 이때는
 *  내려가는 250ms 동안 투명 Modal 오버레이가 새 화면의 탭을 삼키므로 애니메이션 없이 바로
 *  내린다(closeImmediately). 배경 탭·뒤로가기(onRequestClose)는 그대로 내려가는 애니메이션. */
const useSheetSlide = (isOpen: boolean) => {
  const offscreen = Dimensions.get("window").height;
  const [isMounted, setIsMounted] = useState(isOpen);
  // closeImmediately가 부모의 isOpen=false와 같은 이벤트 배치로 반영되도록 state로 둔다 —
  // 그래야 같은 렌더에서 Modal visible이 false가 된다.
  const [skipSlideDown, setSkipSlideDown] = useState(false);
  const translateY = useRef(new Animated.Value(isOpen ? 0 : offscreen)).current;

  useEffect(() => {
    if (isOpen) {
      // 부모가 닫지 않았으면(또는 다시 열면) 바로 닫기 표시를 거둔다.
      setSkipSlideDown(false);
      setIsMounted(true);
      return;
    }
    if (skipSlideDown) {
      translateY.setValue(offscreen);
      setIsMounted(false);
      return;
    }
    const animation = Animated.timing(translateY, {
      toValue: offscreen,
      duration: SLIDE_DURATION_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setIsMounted(false);
    });
    return () => animation.stop();
  }, [isOpen, skipSlideDown, offscreen, translateY]);

  // 올라오는 애니메이션은 Modal·시트가 마운트된 뒤(isMounted가 반영된 커밋 이후)에 시작한다 —
  // setIsMounted와 같은 이펙트에서 시작하면 아직 없는 뷰에 걸려 첫 프레임이 빠진다.
  useEffect(() => {
    if (!isOpen || !isMounted) return;
    const animation = Animated.timing(translateY, { toValue: 0, duration: SLIDE_DURATION_MS, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [isOpen, isMounted, translateY]);

  return {
    isVisible: isMounted && !skipSlideDown,
    translateY,
    closeImmediately: () => setSkipSlideDown(true),
  };
};

/**
 * 캘린더에서 날짜를 탭했을 때 여는 시트. 기존 shared/ui/bottomSheet/BottomSheet는
 * 옵션 단일 선택 전용(상태 변경 시트)이라 할 일 목록+추가 버튼을 담을 수 없어,
 * 같은 Modal+slide+overlay+handle 시각 언어로 새로 만든다(계획 문서 1절 참고).
 * 항목 유무와 무관하게 항상 열리고(스펙 8절 결정 1), 빈 상태에도 추가 버튼을 둔다.
 *
 * 항목은 웹 캘린더 시트(DayDetailItem)처럼 체크박스 없는 정보형으로 보여준다 — 상태·시작·마감과
 * 반복 요약을 훑어보는 용도. 웹과 달리 항목 전체를 눌러 상세 화면으로 갈 수 있다.
 */
export const DateTodosSheet = ({
  isOpen,
  onClose,
  dateLabel,
  dateKey = null,
  todos,
  googleEvents = [],
  onPressTodo,
  onAddTodo,
}: DateTodosSheetProps) => {
  // 구글 일정 캡션("전날부터 이어짐" 판정)은 날짜 키가 있어야 정확하다 — 없으면 일정 줄을 그리지 않는다.
  const visibleGoogleEvents = dateKey ? googleEvents : [];
  const hasItems = todos.length > 0 || visibleGoogleEvents.length > 0;
  const { isVisible, translateY, closeImmediately } = useSheetSlide(isOpen);
  const handlePressTodo = (todo: Todo) => {
    closeImmediately();
    onPressTodo(todo);
  };
  const handleAddTodo = () => {
    closeImmediately();
    onAddTodo();
  };

  // Modal의 animationType="slide"는 어두운 배경까지 통째로 밀어 올려 어색하다(11-21 사용자 피드백).
  // Modal 애니메이션은 끄고 배경은 그 자리에 바로 깔고, 흰 시트만 아래에서 올라오게 한다.
  return (
    <Modal testID="date-todos-sheet-modal" transparent animationType="none" visible={isVisible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="닫기">
        <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
        {/* flexShrink: maxHeight(80%)는 Animated.View에 있다 — 이 래퍼가 줄어들어야 안쪽 ScrollView도
            줄어 하단 "할 일 추가"가 작은 화면·큰 글꼴에서 잘리지 않는다. */}
        <Pressable testID="date-todos-sheet-content" style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{dateLabel}</Text>
          </View>

          {hasItems ? (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {todos.map((todo) => (
                <DateTodoItem key={todo.id} todo={todo} onPress={handlePressTodo} />
              ))}
              {dateKey &&
                visibleGoogleEvents.map((event) => (
                  <GoogleEventItem key={`google-${event.id}`} event={event} dateKey={dateKey} />
                ))}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <EmptyState
                icon={CalendarDays}
                title="이 날짜엔 할 일이 없어요"
                description="새로운 할 일을 추가해보세요"
              />
            </View>
          )}

          <View style={styles.footer}>
            <Button title="할 일 추가" onPress={handleAddTodo} variant="primary" />
          </View>
        </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const DateTodoItem = ({ todo, onPress }: { todo: Todo; onPress: (todo: Todo) => void }) => {
  const isOverdue = isTodoOverdue(todo);
  const meta = [
    STATUS_LABEL[todo.status],
    todo.startAt && `시작: ${formatMonthDay(todo.startAt)}`,
    todo.dueAt && `마감: ${formatMonthDay(todo.dueAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      testID={`date-todo-${todo.id}`}
      onPress={() => onPress(todo)}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.item,
        {
          borderLeftColor: isOverdue ? colors.danger.main : statusColors[todo.status].main,
          backgroundColor: isOverdue ? colors.danger.background : colors.background.primary,
        },
        pressed && styles.itemPressed,
      ]}
    >
      <View style={styles.itemTitleRow}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {todo.title}
        </Text>
        {todo.recurrenceId != null && <RecurrenceBadge />}
      </View>
      <Text style={styles.itemMeta}>{meta}</Text>
      {todo.recurrenceId != null && todo.recurrence && (
        <Text style={styles.itemRecurrence}>{formatRecurrenceSummary(todo.recurrence, todo.dueAt)}</Text>
      )}
    </Pressable>
  );
};

/** 구글 일정은 읽기 전용 — 눌러도 이동하지 않으므로 버튼이 아닌 정적 행(웹 DayDetailStatic과 동일). */
const GoogleEventItem = ({ event, dateKey }: { event: GoogleCalendarEvent; dateKey: string }) => (
  <View
    testID={`date-google-event-${event.id}`}
    style={[styles.item, { borderLeftColor: colors.text.secondary, backgroundColor: colors.background.primary }]}
  >
    <View style={styles.itemTitleRow}>
      <Text style={styles.itemTitle} numberOfLines={2}>
        {event.title}
      </Text>
      <CalendarDays size={14} color={colors.text.secondary} />
    </View>
    <Text style={styles.itemMeta}>{`구글 캘린더 · ${formatGoogleEventTime(event.start, dateKey)}`}</Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
  },
  content: {
    flexShrink: 1,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border.tertiary,
    borderRadius: 2,
    alignSelf: "center",
    marginVertical: spacing.md,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  list: {
    maxHeight: 360,
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  // 웹 DayDetailItem: padding 12px 16px, 좌측 4px 보더, 오른쪽만 둥근 모서리 8px.
  item: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderLeftWidth: 4,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.primary,
  },
  itemMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.text.secondary,
  },
  itemRecurrence: {
    marginTop: 2,
    fontSize: 11,
    color: colors.brand.strong,
  },
  empty: {
    minHeight: 240,
  },
  footer: {
    padding: spacing.lg,
  },
});

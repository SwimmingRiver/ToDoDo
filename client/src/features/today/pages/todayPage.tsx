import { useState, useCallback } from "react";
import { Sun, Plus } from "lucide-react";
import { useTodayTodos } from "../hooks/useTodayTodos";
import { useTodo } from "@/features/todo/hooks";
import { formatTodayLabel } from "@/shared/utils/formatToday";
import { toDateKey, parseLocalDateOnly } from "@/shared/utils/date";
import { EmptyState, TodayItemSkeleton, Modal } from "@/shared";
import TodoForm from "@/features/todo/components/todoForm/todoForm";
import WeekStrip from "../components/weekStrip";
import DailyProgress from "../components/dailyProgress";
import TodaySection from "../components/todaySection";
import TodayTodoItem from "../components/todayTodoItem";
import { Container, List } from "./todayPage.styles";

const TodayPage = () => {
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [windowStart, setWindowStart] = useState(() => toDateKey(new Date()));
  const [isAddOpen, setIsAddOpen] = useState(false);

  const shiftWindow = useCallback((days: number) => {
    setWindowStart((prev) => {
      const d = parseLocalDateOnly(prev);
      d.setDate(d.getDate() + days);
      return toDateKey(d);
    });
  }, []);

  const handleGoToToday = useCallback(() => {
    const today = toDateKey(new Date());
    setWindowStart(today);
    setSelectedDate(today);
  }, []);

  const {
    inProgressTodos,
    doneTodos,
    doneCount,
    totalCount,
    markers,
    isLoading,
    isError,
    toggleDone,
  } = useTodayTodos(selectedDate, windowStart);
  const { useGetTodos } = useTodo();

  const hasTodos = inProgressTodos.length > 0 || doneTodos.length > 0;

  return (
    <Container>
      <WeekStrip
        selectedDate={selectedDate}
        windowStart={windowStart}
        markers={markers}
        onSelectDate={setSelectedDate}
        onShiftLeft={() => shiftWindow(-7)}
        onShiftRight={() => shiftWindow(7)}
        onGoToToday={handleGoToToday}
      />
      <DailyProgress
        dateLabel={formatTodayLabel(selectedDate)}
        doneCount={doneCount}
        totalCount={totalCount}
      />

      {isLoading && <TodayItemSkeleton />}

      {!isLoading && isError && (
        <EmptyState
          icon={Sun}
          title="할 일을 불러오지 못했습니다"
          description="잠시 후 다시 시도해주세요"
          actionLabel="다시 시도"
          onAction={() => useGetTodos.refetch()}
        />
      )}

      {!isLoading && !isError && !hasTodos && (
        <EmptyState
          icon={Sun}
          title="오늘 할 일이 없습니다"
          description="여유로운 하루네요. 새로운 할 일을 추가해보세요"
          actionLabel="새 할 일 추가"
          actionIcon={Plus}
          onAction={() => setIsAddOpen(true)}
        />
      )}

      {!isLoading && !isError && hasTodos && (
        <>
          {inProgressTodos.length > 0 && (
            <TodaySection title="진행 중">
              <List>
                {inProgressTodos.map((todo) => (
                  <TodayTodoItem
                    key={todo.id}
                    todo={todo}
                    onToggleDone={toggleDone}
                  />
                ))}
              </List>
            </TodaySection>
          )}

          {doneTodos.length > 0 && (
            <TodaySection title="완료">
              <List>
                {doneTodos.map((todo) => (
                  <TodayTodoItem
                    key={todo.id}
                    todo={todo}
                    onToggleDone={toggleDone}
                  />
                ))}
              </List>
            </TodaySection>
          )}
        </>
      )}

      <Modal
        isOpen={isAddOpen}
        setIsOpen={setIsAddOpen}
        children={<TodoForm onClose={() => setIsAddOpen(false)} />}
      />
    </Container>
  );
};

export default TodayPage;

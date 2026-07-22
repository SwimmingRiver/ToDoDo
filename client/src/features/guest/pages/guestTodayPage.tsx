import { useCallback } from "react";
import { Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/shared";
import Footer from "@/layouts/footer/footer";
import DailyProgress from "@/features/today/components/dailyProgress";
import TodaySection from "@/features/today/components/todaySection";
import TodayTodoItem from "@/features/today/components/todayTodoItem";
import { formatTodayLabel } from "@/shared/utils/formatToday";
import { toDateKey } from "@/shared/utils/date";
import { useGuestTodos } from "../hooks/useGuestTodos";
import GuestHeader from "../components/guestHeader";
import GuestBanner from "../components/guestBanner";
import GuestAddTodoInput from "../components/guestAddTodoInput";
import { PageContainer, Content, List } from "./guestTodayPage.styles";

const GuestTodayPage = () => {
  const navigate = useNavigate();
  const {
    inProgressTodos,
    doneTodos,
    doneCount,
    totalCount,
    addTodo,
    toggleDone,
    deleteTodo,
  } = useGuestTodos();

  const goToLogin = useCallback(() => navigate("/login"), [navigate]);
  // 게스트 데이터는 Firestore 문서가 아니라 로컬 목업이라 상세 라우트가 없다 — no-op으로 오버라이드.
  const handleItemClick = useCallback(() => {}, []);

  const hasTodos = inProgressTodos.length > 0 || doneTodos.length > 0;

  return (
    <PageContainer>
      <GuestHeader onLoginClick={goToLogin} />
      <GuestBanner onLoginClick={goToLogin} />
      <Content>
        <DailyProgress
          dateLabel={formatTodayLabel(toDateKey(new Date()))}
          doneCount={doneCount}
          totalCount={totalCount}
        />
        <GuestAddTodoInput onAdd={addTodo} />

        {!hasTodos && (
          <EmptyState
            icon={Sun}
            title="체험할 할 일이 없습니다"
            description="위 입력창에 새 할 일을 추가해보세요"
          />
        )}

        {hasTodos && (
          <>
            {inProgressTodos.length > 0 && (
              <TodaySection title="진행 중">
                <List>
                  {inProgressTodos.map((todo) => (
                    <TodayTodoItem
                      key={todo.id}
                      todo={todo}
                      onToggleDone={toggleDone}
                      onItemClick={handleItemClick}
                      onDelete={deleteTodo}
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
                      onItemClick={handleItemClick}
                      onDelete={deleteTodo}
                    />
                  ))}
                </List>
              </TodaySection>
            )}
          </>
        )}
      </Content>
      <Footer />
    </PageContainer>
  );
};

export default GuestTodayPage;

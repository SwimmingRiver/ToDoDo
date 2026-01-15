import "./App.css";
import Header from "./layouts/header/header";
import Footer from "./layouts/footer/footer";
import ResizeableLayout from "./layouts/resizeableLayout/resizeableLayout";
import { TodoList, TodoDetail, useTodo } from "@/features/todo";
import { PieChartComponent, Calendar } from "@/features/dashboard";
import { KanbanBoard } from "@/features/kanban";
import { useMediaQuery, CheckboxSkeleton } from "@/shared";
import { Routes, Route } from "react-router-dom";
import { useState } from "react";
import { ListTodo, Columns3, List, Calendar as CalendarIcon, PieChart } from "lucide-react";
import {
  Container,
  ModeTapContainer,
  TabButton,
  Main,
  MobileTabContainer,
  MobileTabButton,
  MobileContent,
  ContentWrapper,
} from "./App.styles";

type MobileTab = "list" | "calendar" | "chart";

const App = () => {
  const {
    useGetTodos: { data: todos, isLoading },
  } = useTodo();
  const [mode, setMode] = useState<"todo" | "kanban">("todo");
  const [mobileTab, setMobileTab] = useState<MobileTab>("list");
  const isTablet = useMediaQuery("tablet");

  const renderMobileContent = () => {
    switch (mobileTab) {
      case "list":
        return isLoading ? <CheckboxSkeleton count={5} /> : <TodoList todos={todos ?? []} />;
      case "calendar":
        return <Calendar />;
      case "chart":
        return <PieChartComponent />;
    }
  };

  return (
    <Container>
      <Header />
      <ModeTapContainer>
        <TabButton $active={mode === "todo"} onClick={() => setMode("todo")}>
          <ListTodo size={16} /> Todo
        </TabButton>
        <TabButton
          $active={mode === "kanban"}
          onClick={() => setMode("kanban")}
        >
          <Columns3 size={16} /> Kanban
        </TabButton>
      </ModeTapContainer>
      <Main>
        {mode === "kanban" && <KanbanBoard />}
        {mode === "todo" && (
          <ContentWrapper>
            {isTablet ? (
              <>
                <MobileTabContainer>
                  <MobileTabButton
                    $active={mobileTab === "list"}
                    onClick={() => setMobileTab("list")}
                  >
                    <List size={16} /> 리스트
                  </MobileTabButton>
                  <MobileTabButton
                    $active={mobileTab === "calendar"}
                    onClick={() => setMobileTab("calendar")}
                  >
                    <CalendarIcon size={16} /> 캘린더
                  </MobileTabButton>
                  <MobileTabButton
                    $active={mobileTab === "chart"}
                    onClick={() => setMobileTab("chart")}
                  >
                    <PieChart size={16} /> 차트
                  </MobileTabButton>
                </MobileTabContainer>
                <MobileContent>{renderMobileContent()}</MobileContent>
              </>
            ) : (
              <ResizeableLayout
                direction="row"
                children1={isLoading ? <CheckboxSkeleton count={6} /> : <TodoList todos={todos ?? []} />}
                children2={
                  <ResizeableLayout
                    direction="column"
                    children1={<PieChartComponent />}
                    children2={<Calendar />}
                  />
                }
              />
            )}
          </ContentWrapper>
        )}
        <Routes>
          <Route path="/todo/:id" element={<TodoDetail />} />
        </Routes>
      </Main>
      <Footer />
    </Container>
  );
};

export default App;

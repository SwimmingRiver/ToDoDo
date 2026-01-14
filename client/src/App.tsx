import "./App.css";
import Header from "./layouts/header/header";
import Footer from "./layouts/footer/footer";
import ResizeableLayout from "./layouts/resizeableLayout/resizeableLayout";
import { TodoList, TodoDetail, useTodo } from "@/features/todo";
import { PieChartComponent, Calendar } from "@/features/dashboard";
import { KanbanBoard } from "@/features/kanban";
import { useMediaQuery } from "@/shared";
import { Routes, Route } from "react-router-dom";
import { useState } from "react";
import {
  Container,
  ModeTapContainer,
  TabButton,
  Main,
  MobileTabContainer,
  MobileTabButton,
  MobileContent,
} from "./App.styles";

type MobileTab = "list" | "calendar" | "chart";

const App = () => {
  const {
    useGetTodos: { data: todos },
  } = useTodo();
  const [mode, setMode] = useState<"todo" | "kanban">("todo");
  const [mobileTab, setMobileTab] = useState<MobileTab>("list");
  const isTablet = useMediaQuery("tablet");

  const renderMobileContent = () => {
    switch (mobileTab) {
      case "list":
        return <TodoList todos={todos ?? []} />;
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
          Todo
        </TabButton>
        <TabButton
          $active={mode === "kanban"}
          onClick={() => setMode("kanban")}
        >
          Kanban
        </TabButton>
      </ModeTapContainer>
      <Main>
        {mode === "kanban" && <KanbanBoard />}
        {mode === "todo" && (
          <>
            {isTablet ? (
              <>
                <MobileTabContainer>
                  <MobileTabButton
                    $active={mobileTab === "list"}
                    onClick={() => setMobileTab("list")}
                  >
                    리스트
                  </MobileTabButton>
                  <MobileTabButton
                    $active={mobileTab === "calendar"}
                    onClick={() => setMobileTab("calendar")}
                  >
                    캘린더
                  </MobileTabButton>
                  <MobileTabButton
                    $active={mobileTab === "chart"}
                    onClick={() => setMobileTab("chart")}
                  >
                    차트
                  </MobileTabButton>
                </MobileTabContainer>
                <MobileContent>{renderMobileContent()}</MobileContent>
              </>
            ) : (
              <ResizeableLayout
                direction="row"
                children1={<TodoList todos={todos ?? []} />}
                children2={
                  <ResizeableLayout
                    direction="column"
                    children1={<PieChartComponent />}
                    children2={<Calendar />}
                  />
                }
              />
            )}
          </>
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

import "./App.css";
import Header from "./layouts/header/header";
import Footer from "./layouts/footer/footer";
import ResizeableLayout from "./layouts/resizeableLayout/resizeableLayout";
import { TodoList, TodoDetail, useTodo } from "@/features/todo";
import { PieChartComponent, Calendar } from "@/features/dashboard";
import { KanbanBoard } from "@/features/kanban";
import { Routes, Route } from "react-router-dom";
import { useState } from "react";
import { Container, ModeTapContainer, TabButton, Main } from "./App.styles";

const App = () => {
  const {
    useGetTodos: { data: todos },
  } = useTodo();
  const [mode, setMode] = useState<"todo" | "kanban">("todo");
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
        <Routes>
          <Route path="/todo/:id" element={<TodoDetail />} />
        </Routes>
      </Main>
      <Footer />
    </Container>
  );
};

export default App;

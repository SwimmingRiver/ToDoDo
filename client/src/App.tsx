import "./App.css";
import Header from "./layouts/header/header";
import Footer from "./layouts/footer/footer";
import ResizeableLayout from "./layouts/resizeableLayout/resizeableLayout";
import TodoList from "./components/todoList/todoList";
import { styled } from "styled-components";
import PieChartComponent from "./components/charts/pieChart";
import Calendar from "./components/calendars/calendar";
import { useTodo } from "./components/todoList/queries";
import { Routes, Route } from "react-router-dom";
import TodoDetail from "./components/todoList/todoDetail";
import KanbanBoard from "./components/kanban/kanbanBoard";
import { useState } from "react";

const Container = styled.div`
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  height: 100vh;
`;
const ModeTapContainer = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  background-color: #f1f3f4;
  border-radius: 8px;
  width: fit-content;
  margin: 8px 16px;
`;

const TabButton = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: ${({ $active }) => ($active ? "#fff" : "transparent")};
  color: ${({ $active }) => ($active ? "#1a1a1a" : "#5f6368")};
  box-shadow: ${({ $active }) =>
    $active ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none"};

  &:hover {
    background-color: ${({ $active }) => ($active ? "#fff" : "#e8eaed")};
  }
`;

const App = () => {
  const {
    useGetTodos: { data: todos },
  } = useTodo();
  const [mode, setMode] = useState<"todo" | "kanban">("kanban");
  return (
    <Container>
      <Header />
      <ModeTapContainer>
        <TabButton $active={mode === "todo"} onClick={() => setMode("todo")}>
          Todo
        </TabButton>
        <TabButton $active={mode === "kanban"} onClick={() => setMode("kanban")}>
          Kanban
        </TabButton>
      </ModeTapContainer>
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
      <Footer />
    </Container>
  );
};

export default App;

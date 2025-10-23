import "./App.css";
import Header from "./layouts/header/header";
import Footer from "./layouts/footer/footer";
import ResizeableLayout from "./layouts/resizeableLayout/resizeableLayout";
import TodoList from "./components/todoList/todoList";
import { styled } from "styled-components";
import type { Todo } from "./types/todo.type";
import PieChartComponent from "./components/charts/pieChart";
const Container = styled.div`
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
`;
const exmapleTodoList: Todo[] = [
  {
    id: "1",
    title: "Todo 1",
    description: "Description 1",
    status: "todo",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    startAt: null,
    dueAt: null,
    doneAt: null,
    priority: "low",
    parentId: null,
    order: 1,
  },
  {
    id: "2",
    title: "Todo 2",
    description: "Description 2",
    status: "todo",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    startAt: null,
    dueAt: null,
    doneAt: null,
    priority: "low",
    parentId: null,
    order: 2,
  },

  {
    id: "3",
    title: "Todo 3",
    description: "Description 3",
    status: "todo",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    startAt: null,
    dueAt: null,
    doneAt: null,
    priority: "low",
    parentId: null,
    order: 3,
  },
  {
    id: "4",
    title: "Todo 4",
    description: "Description 4",
    status: "todo",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    startAt: null,
    dueAt: null,
    doneAt: null,
    priority: "low",
    parentId: "1",
    order: 1,
  },
];
function App() {
  return (
    <Container>
      <Header />
      <ResizeableLayout
        direction="row"
        children1={<TodoList todos={exmapleTodoList} />}
        children2={
          <ResizeableLayout
            direction="column"
            children1={<PieChartComponent />}
            children2={
              <div>
                <h1>children2-2</h1>
              </div>
            }
          />
        }
      />

      <Footer />
    </Container>
  );
}

export default App;

import "./App.css";
import Header from "./layouts/header/header";
import Footer from "./layouts/footer/footer";
import ResizeableLayout from "./layouts/resizeableLayout/resizeableLayout";
import TodoList from "./components/todoList/todoList";
import { styled } from "styled-components";
import PieChartComponent from "./components/charts/pieChart";
import Calendar from "./components/calendars/calendar";
import { useTodo } from "./components/todoList/queries";
const Container = styled.div`
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
`;

const App = () => {
  const {
    userGetTodos: { data: todos },
  } = useTodo();
  console.log(todos);
  return (
    <Container>
      <Header />
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

      <Footer />
    </Container>
  );
};

export default App;

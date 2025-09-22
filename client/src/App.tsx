import "./App.css";
import Header from "./layouts/header/header";
import Footer from "./layouts/footer/footer";
import ResizeableLayout from "./layouts/resizeableLayout/resizeableLayout";
import { styled } from "styled-components";
const Container = styled.div`
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
`;
function App() {
  return (
    <Container>
      <Header />
      <ResizeableLayout
        direction="row"
        children1={
          <div>
            <h1>children1</h1>
          </div>
        }
        children2={
          <ResizeableLayout
            direction="column"
            children1={
              <div>
                <h1>children2-1</h1>
              </div>
            }
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

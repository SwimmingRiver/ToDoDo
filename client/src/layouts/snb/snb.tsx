import styled from "styled-components";

const SNB = ({
  isopen,
  setIsOpen,
}: {
  isopen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  return (
    <>
      {isopen ? (
        <SNBContainer>
          <div>list</div>
          <div>calendar</div>
          <div>chart</div>
          <button onClick={() => setIsOpen(!isopen)}>open</button>
        </SNBContainer>
      ) : (
        <button onClick={() => setIsOpen(!isopen)}>open</button>
      )}
    </>
  );
};

const SNBContainer = styled.div`
  width: 200px;
  height: 100%;
  background-color: #f1f3f4;
  border-right: 1px solid #e0e0e0;
`;

export default SNB;

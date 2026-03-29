import { useState } from "react";
import styled from "styled-components";
import TodoList from "@/features/todo/components/todoList";
import DueTodo from "@/features/todo/components/dueTodo";
import PieChart from "@/features/dashboard/components/pieChart";
import type { Todo } from "@/features/todo/types/todo.type";

const TABS = [
  { key: "todo", label: "할 일" },
  { key: "due", label: "마감 임박" },
  { key: "chart", label: "차트" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const MobileHomePage = ({ todos }: { todos: Todo[] }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("todo");

  return (
    <Container>
      <TabBar>
        {TABS.map(({ key, label }) => (
          <TabButton
            key={key}
            $active={activeTab === key}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </TabButton>
        ))}
      </TabBar>
      <Content>
        {activeTab === "todo" && <TodoList todos={todos} />}
        {activeTab === "due" && <DueTodo todos={todos} />}
        {activeTab === "chart" && <PieChart />}
      </Content>
    </Container>
  );
};

export default MobileHomePage;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  background-color: #fff;
  flex-shrink: 0;
`;

const TabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 12px 8px;
  border: none;
  background-color: transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: ${({ $active }) => ($active ? "#1c72eb" : "#5f6368")};
  border-bottom: 2px solid
    ${({ $active }) => ($active ? "#1c72eb" : "transparent")};
  transition: all 0.2s ease;

  &:hover {
    color: ${({ $active }) => ($active ? "#1c72eb" : "#1a1a1a")};
    background-color: #f8f9fa;
  }
`;

const Content = styled.div`
  flex: 1;
  overflow: hidden;
`;

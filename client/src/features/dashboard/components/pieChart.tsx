import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo } from "react";
import type { Todo } from "@/features/todo";
import { useTodo } from "@/features/todo";
import { PieChartContainer } from "./pieChart.styles";
import { statusColors, type Status } from "../../../styles/statusColors";
import { EmptyState } from "@/shared";
import { AlertCircle, ChartPie } from "lucide-react";
import styled, { keyframes } from "styled-components";

const PieChartComponent = () => {
  const { useGetTodos } = useTodo();
  const { data: todos, isLoading, isError } = useGetTodos;

  const statusLabels: Record<string, string> = {
    todo: "할 일",
    doing: "진행 중",
    done: "완료",
  };

  const data = useMemo(() => {
    if (!todos || todos.length === 0) return [];

    const statusCount = todos.reduce(
      (acc: Record<string, number>, todo: Todo) => {
        acc[todo.status] = (acc[todo.status] || 0) + 1;
        return acc;
      },
      {}
    );

    const total = todos.length;

    return Object.entries(statusCount).map(([status, count]) => ({
      status,
      name: `${statusLabels[status]}: ${count}개 (${((count / total) * 100).toFixed(0)}%)`,
      value: count,
    }));
  }, [todos]);
  if (isLoading) {
    return (
      <LoadingWrapper>
        <Spinner />
      </LoadingWrapper>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="차트 데이터를 불러오지 못했습니다"
        description="네트워크 연결을 확인하고 다시 시도해주세요"
      />
    );
  }

  if (!todos || todos.length === 0) {
    return (
      <EmptyState
        icon={ChartPie}
        title="표시할 데이터가 없습니다"
        description="할 일을 추가하면 상태별 통계를 확인할 수 있습니다"
      />
    );
  }

  return (
    <PieChartContainer>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="40%"
            innerRadius={0}
            outerRadius="60%"
            dataKey="value"
            nameKey="name"
          >
            {data?.map((entry, index: number) => (
              <Cell
                key={`cell-${index}`}
                fill={statusColors[entry.status as Status]?.main ?? "#999999"}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: "white", color: "black" }}
          />
          <Legend
            layout="horizontal"
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ paddingTop: 16 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </PieChartContainer>
  );
};

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const LoadingWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid #e0e0e0;
  border-top-color: #1c72eb;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

export default PieChartComponent;

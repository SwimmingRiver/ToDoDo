import { styled } from "styled-components";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo } from "react";
import type { Todo } from "../../types/todo.type";
import { useTodo } from "../todoList/queries";

const PieChartContainer = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0px;
  min-height: 0px;
  overflow: hidden;
`;

const STATUS_COLORS: Record<string, string> = {
  todo: "#FF8042", // 빨강
  doing: "#FFBB28", // 노랑
  done: "#00C49F", // 초록
};

const PieChartComponent = () => {
  const { userGetTodos } = useTodo();
  const { data: todos } = userGetTodos;

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
      name: status,
      value: count,
      percentage: ((count / total) * 100).toFixed(1),
    }));
  }, [todos]);
  return (
    <PieChartContainer>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            label={({ name, value, percentage }) =>
              `${name}: ${value} (${percentage}%)`
            }
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={0}
            outerRadius="70%"
            dataKey="value"
            nameKey="name"
          >
            {data?.map((entry, index: number) => (
              <Cell
                key={`cell-${index}`}
                fill={STATUS_COLORS[entry.name] || "#999999"}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: "white", color: "black" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </PieChartContainer>
  );
};

export default PieChartComponent;

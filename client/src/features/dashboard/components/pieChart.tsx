import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo } from "react";
import type { Todo } from "@/features/todo";
import { useTodo } from "@/features/todo";
import { PieChartContainer } from "./pieChart.styles";
import { statusColors, type Status } from "../../../styles/statusColors";

const PieChartComponent = () => {
  const { useGetTodos } = useTodo();
  const { data: todos } = useGetTodos;

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

export default PieChartComponent;

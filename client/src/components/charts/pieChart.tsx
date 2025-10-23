import { styled } from "styled-components";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

const PieChartContainer = styled.div`
  width: 100%;
  height: 100%;
`;
const data = [
  { name: "Todo", value: 400 },
  { name: "Doing", value: 300 },
  { name: "Done", value: 200 },
];
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];
const PieChartComponent = () => {
  return (
    <PieChartContainer>
      <PieChart width="100%" height="100%" responsive>
        <Pie
          label={({ name, value }) => `${name}: ${value}`}
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={0}
          outerRadius={100}
          dataKey="value"
          nameKey="name"
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ backgroundColor: "white", color: "black" }} />
      </PieChart>
    </PieChartContainer>
  );
};

export default PieChartComponent;

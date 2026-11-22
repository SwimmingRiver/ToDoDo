import { describe, it, expect } from "@jest/globals";
import { render } from "@testing-library/react-native";
import { BarChart } from "../BarChart";
import { HorizontalBars } from "../HorizontalBars";
import { StackedBar } from "../StackedBar";

interface JsonNode {
  type: string;
  props: Record<string, unknown>;
  children: (JsonNode | string)[] | null;
}

// react-native-svg는 네이티브 호스트 노드로 렌더되므로 직렬화된 트리를 순회해 센다.
const collect = (node: JsonNode | JsonNode[] | null, pick: (n: JsonNode) => boolean): JsonNode[] => {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((n) => collect(n, pick));
  const children = (node.children ?? []).filter((c): c is JsonNode => typeof c !== "string");
  return [...(pick(node) ? [node] : []), ...children.flatMap((c) => collect(c, pick))];
};

const points = [
  { label: "1일", value: 1 },
  { label: "2일", value: 3 },
  { label: "3일", value: 2 },
];
const rows = [
  { label: "높음", value: 2 },
  { label: "보통", value: 2 },
  { label: "낮음", value: 0 },
];
const segments = [
  { key: "a", label: "A", value: 1 },
  { key: "b", label: "B", value: 3 },
];

describe("insights charts", () => {
  it("width 0이면 그리지 않는다", async () => {
    expect((await render(<BarChart points={points} width={0} accessibilityLabel="x" />)).toJSON()).toBeNull();
    expect((await render(<HorizontalBars rows={rows} width={0} accessibilityLabel="x" />)).toJSON()).toBeNull();
    expect((await render(<StackedBar segments={segments} colorOf={() => "#000"} width={0} accessibilityLabel="x" />)).toJSON()).toBeNull();
  });

  it("BarChart는 점 개수만큼 막대를 그린다", async () => {
    const { toJSON } = await render(<BarChart points={points} width={300} accessibilityLabel="x" />);
    expect(collect(toJSON(), (n) => n.type === "RNSVGRect")).toHaveLength(3);
  });

  it("HorizontalBars 값 텍스트", async () => {
    const { toJSON } = await render(<HorizontalBars rows={rows} width={300} accessibilityLabel="x" />);
    const texts = collect(toJSON(), (n) => n.type === "RNSVGTSpan").map((n) => n.props.content);
    expect(texts.filter((t) => t === "2 (50%)")).toHaveLength(2);
    expect(texts).toContain("0 (0%)");
  });

  it("접근성 라벨", async () => {
    const { getByLabelText } = await render(<HorizontalBars rows={rows} width={300} accessibilityLabel="총 3건" />);
    expect(getByLabelText("총 3건")).toBeTruthy();
  });
});

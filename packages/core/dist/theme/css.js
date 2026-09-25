const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
export const toCssVarName = (path) => `--${path.map(kebab).join("-")}`;
const mapLeaves = (node, path, fn) => Object.fromEntries(Object.entries(node).map(([k, v]) => [
    k,
    typeof v === "string" ? fn([...path, k], v) : mapLeaves(v, [...path, k], fn),
]));
/** 같은 모양의 객체를 값만 `var(--경로)`로 바꿔 돌려준다. */
export const toCssVarRefs = (tokens) => mapLeaves(tokens, [], (path) => `var(${toCssVarName(path)})`);
const declarations = (tokens) => {
    const lines = [];
    mapLeaves(tokens, [], (path, value) => {
        lines.push(`  ${toCssVarName(path)}: ${value};`);
        return value;
    });
    return lines.join("\n");
};
export const buildThemeCss = (light, dark) => `:root {\n  color-scheme: light;\n${declarations(light)}\n}\n` +
    `:root[data-theme="dark"] {\n  color-scheme: dark;\n${declarations(dark)}\n}\n`;

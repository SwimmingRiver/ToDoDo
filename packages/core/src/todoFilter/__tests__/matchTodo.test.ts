import { describe, it, expect } from "vitest";
import { EMPTY_TODO_FILTER, isTodoFilterActive, matchesTodoFilter } from "../index";
import type { FilterableTodo, TodoFilter } from "../index";

const f = (query: string, priorities: TodoFilter["priorities"] = []): TodoFilter => ({ query, priorities });

describe("matchesTodoFilter", () => {
  const todo: FilterableTodo = { title: "운동 30분", priority: "high" };

  it("제목 부분 일치", () => {
    expect(matchesTodoFilter(todo, f("운"))).toBe(true);
  });
  it("앞뒤 공백 제거", () => {
    expect(matchesTodoFilter(todo, f("  운동 "))).toBe(true);
  });
  it("공백뿐인 검색어는 필터 꺼짐", () => {
    expect(matchesTodoFilter(todo, f("   "))).toBe(true);
  });
  it("설명 일치", () => {
    expect(matchesTodoFilter({ title: "a", description: "헬스장 가기" }, f("헬스"))).toBe(true);
  });
  it("설명이 없으면 불일치", () => {
    expect(matchesTodoFilter({ title: "a", description: undefined }, f("x"))).toBe(false);
    expect(matchesTodoFilter({ title: "a", description: null }, f("x"))).toBe(false);
  });
  it("대소문자 무시", () => {
    expect(matchesTodoFilter({ title: "Report" }, f("report"))).toBe(true);
  });
  it("NFD/NFC 양방향 일치", () => {
    const nfd = "운동".normalize("NFD");
    expect(matchesTodoFilter({ title: nfd }, f("운동"))).toBe(true);
    expect(matchesTodoFilter({ title: "운동" }, f(nfd))).toBe(true);
  });
  it("우선순위 집합 포함 여부", () => {
    expect(matchesTodoFilter(todo, f("", ["high", "medium"]))).toBe(true);
    expect(matchesTodoFilter(todo, f("", ["low"]))).toBe(false);
  });
  it("우선순위 없음은 집합이 있으면 불일치, 비면 통과", () => {
    expect(matchesTodoFilter({ title: "a", priority: undefined }, f("", ["high"]))).toBe(false);
    expect(matchesTodoFilter({ title: "a", priority: undefined }, f("", []))).toBe(true);
  });
  it("검색어와 우선순위는 AND", () => {
    expect(matchesTodoFilter(todo, f("운동", ["low"]))).toBe(false);
  });
});

describe("isTodoFilterActive", () => {
  it("빈 필터·공백 검색어는 꺼짐", () => {
    expect(isTodoFilterActive(EMPTY_TODO_FILTER)).toBe(false);
    expect(isTodoFilterActive(f(" "))).toBe(false);
  });
  it("우선순위만 있어도 켜짐", () => {
    expect(isTodoFilterActive(f("", ["low"]))).toBe(true);
  });
});

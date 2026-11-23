import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import UserAvatar from "../userAvatar";
import { userLabel } from "../userLabel";

describe("userLabel", () => {
  it("displayName을 우선 사용한다", () => {
    expect(userLabel({ displayName: "강수영", email: "a@b.com" })).toBe("강수영");
  });
  it("displayName이 공백이면 이메일 @ 앞부분을 쓴다", () => {
    expect(userLabel({ displayName: "  ", email: "swim@x.com" })).toBe("swim");
  });
  it("아무것도 없으면 '사용자'", () => {
    expect(userLabel({ displayName: null, email: null })).toBe("사용자");
    expect(userLabel(null)).toBe("사용자");
  });
});

describe("UserAvatar", () => {
  const base = { displayName: "강수영", email: "a@b.com" };

  it("photoURL이 없으면 img 없이 첫 글자를 보여준다", () => {
    const { container } = render(<UserAvatar user={{ ...base, photoURL: null }} size={24} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("강")).toBeInTheDocument();
  });

  it("이름이 이모지로 시작하면 이모지 한 글자를 통째로 보여준다(서로게이트 쌍)", () => {
    render(<UserAvatar user={{ displayName: "😀abc", email: null, photoURL: null }} size={24} />);
    expect(screen.getByText("😀")).toBeInTheDocument();
  });

  it("photoURL이 있으면 img를 보여준다", () => {
    const { container } = render(
      <UserAvatar user={{ ...base, photoURL: "https://example.com/a.png" }} size={24} />,
    );
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("이미지 로드 실패 시 이니셜로 바뀐다", () => {
    const { container } = render(
      <UserAvatar user={{ ...base, photoURL: "https://example.com/a.png" }} size={24} />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("강")).toBeInTheDocument();
  });
});

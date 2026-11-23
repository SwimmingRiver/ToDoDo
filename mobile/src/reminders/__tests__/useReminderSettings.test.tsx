import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest } from "@jest/globals";
import type { ReactNode } from "react";

jest.mock("../../firebase", () => ({ db: {}, auth: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  getDoc: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
}));
jest.mock("../api/reminderProxyApi", () => ({
  requestReminderRefresh: jest.fn(() => Promise.resolve()),
}));

const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

describe("reminder default hooks", () => {
  it("defaults to 30 when doc missing", async () => {
    const { getDoc } = await import("firebase/firestore");
    (getDoc as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue({ exists: () => false });
    const { useReminderDefault } = await import("../hooks/useReminderSettings");
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReminderDefault(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(30));
  });

  it("set writes reminderDefaultOffsetMinutes and invalidates", async () => {
    const { setDoc } = await import("firebase/firestore");
    const { requestReminderRefresh } = await import("../api/reminderProxyApi");
    const { useSetReminderDefault } = await import("../hooks/useReminderSettings");
    const { client, wrapper } = setup();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(() => useSetReminderDefault(), { wrapper });
    result.current.mutate("off");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(setDoc).toHaveBeenCalledWith(
      { path: "userSettings/u1" },
      { reminderDefaultOffsetMinutes: "off" },
      { merge: true },
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reminderDefault", "u1"] });
    expect(requestReminderRefresh).toHaveBeenCalled();
  });
});

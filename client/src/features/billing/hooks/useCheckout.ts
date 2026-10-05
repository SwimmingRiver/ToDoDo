import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared";
import { useEntitlement } from "@/features/entitlement/hooks/useEntitlement";
import { isPremiumEntitlement } from "@/features/entitlement/utils/isPremiumEntitlement";
import { BillingApiError, createCheckout } from "../api/billingApi";
import { loadPaddle, onPaddleEvent } from "../lib/paddle";

export type CheckoutPhase = "idle" | "opening" | "confirming" | "slow";
/** 이 시간 안에 웹훅이 반영되지 않으면 안내 문구를 바꾼다(실패로 처리하지는 않는다). */
export const CONFIRM_SLOW_MS = 30_000;

export const useCheckout = () => {
  const toast = useToast();
  const { data: entitlement } = useEntitlement();
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  // 상태 업데이트는 비동기라 같은 틱의 연타를 막지 못한다. ref로 즉시 잠근다.
  const busyRef = useRef(false);

  const subscribed =
    entitlement?.status === "active" &&
    entitlement.source === "paddle" &&
    isPremiumEntitlement(entitlement, Date.now());

  useEffect(() => {
    if ((phase === "confirming" || phase === "slow") && subscribed) {
      busyRef.current = false;
      setPhase("idle");
      toast.success("프리미엄이 시작됐어요", "이제 모든 프리미엄 기능을 쓸 수 있어요");
    }
  }, [phase, subscribed, toast]);

  useEffect(() => {
    if (phase !== "confirming") return;
    const id = setTimeout(() => setPhase("slow"), CONFIRM_SLOW_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const start = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase("opening");
    try {
      const transactionId = await createCheckout();
      const paddle = await loadPaddle();
      const off = onPaddleEvent((event) => {
        if (event.name === "checkout.completed") {
          off();
          paddle.Checkout.close();
          setPhase("confirming");
        } else if (event.name === "checkout.closed") {
          off();
          busyRef.current = false;
          setPhase("idle");
        }
      });
      paddle.Checkout.open({ transactionId });
    } catch (error) {
      busyRef.current = false;
      setPhase("idle");
      if (error instanceof BillingApiError && error.code === "NOT_ALLOWED") {
        toast.info("아직 준비 중이에요", "곧 구독을 열어드릴게요");
      } else if (error instanceof BillingApiError && error.code === "ALREADY_SUBSCRIBED") {
        toast.info("이미 구독 중이에요", "구독 관리에서 확인할 수 있어요");
      } else {
        toast.error("결제창을 열지 못했어요", "잠시 후 다시 시도해주세요");
        Sentry.captureException(error, { tags: { feature: "billing" } });
      }
    }
  };

  return { phase, start };
};

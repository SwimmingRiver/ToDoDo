import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "../shared/ui/button/Button";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";
import { useEntitlement } from "./useEntitlement";
import { purchaseClient } from "./iap/purchaseClient";
import { usePurchase } from "./iap/usePurchase";
import { duplicateNotice, getMobilePremiumView, storeName } from "./premiumView";

const TERMS_URL = "https://tododo-app.com/terms";
const PRIVACY_URL = "https://tododo-app.com/privacy";

// 가격은 스토어 상품 정보를 아직 노출하지 않아 고지 문구의 고정 금액을 쓴다.
const disclosure = (store: string) =>
  `월 4,900원, 1개월마다 자동 갱신돼요. 현재 기간이 끝나기 24시간 전까지 해지하지 않으면 다음 기간 요금이 청구돼요. 구독 관리와 해지는 ${store} 계정 설정에서 할 수 있어요.`;

const ERROR_TEXT = {
  LINKED_TO_OTHER_ACCOUNT: "이 구독은 다른 계정에서 사용 중이에요",
  ALREADY_SUBSCRIBED: "이미 구독 중인 다른 Google Play 구독이 있어요. 새 결제는 승인되지 않아 자동으로 환불돼요",
  PENDING: "결제가 승인되면 프리미엄이 켜져요",
  INVALID: "구매를 확인하지 못했어요. 잠시 후 다시 시도해 주세요",
  NETWORK: "네트워크 문제로 구매 확인이 늦어지고 있어요. 앱을 다시 열면 이어서 확인해요",
} as const;

const formatDate = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

const platform = Platform.OS === "ios" ? "ios" : "android";

export const PremiumSection = () => {
  const { data } = useEntitlement();
  const { buy, restore, phase, lastError } = usePurchase();
  const [trialEligible, setTrialEligible] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    purchaseClient
      .isTrialEligible()
      .then((ok) => alive && setTrialEligible(ok))
      .catch(() => alive && setTrialEligible(false));
    return () => {
      alive = false;
    };
  }, []);

  const view = getMobilePremiumView(data, Date.now(), trialEligible);
  const notice = duplicateNotice(data, platform);
  const busy = phase !== "idle";
  const openManage = () => void purchaseClient.openManageSubscriptions();

  const onRestore = async () => {
    setRestoreMessage(null);
    const { restored, failure } = await restore();
    if (!failure) setRestoreMessage(restored > 0 ? "구매를 복원했어요" : "복원할 구매가 없어요");
  };

  const manageButton = <Button title="구독 관리" variant="outline" onPress={openManage} />;

  return (
    <View style={styles.section}>
      <Text style={styles.label}>프리미엄</Text>
      {view.kind === "offer" && (
        <>
          <Text style={styles.body}>AI 할 일 계획 등 프리미엄 기능을 사용할 수 있어요</Text>
          <Button
            title={view.withTrial ? "7일 무료로 시작하기" : "프리미엄 시작하기"}
            onPress={() => void buy(view.withTrial)}
            loading={busy}
          />
          <Text style={styles.small}>{disclosure(platform === "ios" ? "App Store" : "Google Play")}</Text>
          <Button title="구매 복원" variant="text" onPress={() => void onRestore()} disabled={busy} />
          <View style={styles.links}>
            <Button title="이용약관" variant="text" onPress={() => void Linking.openURL(TERMS_URL)} />
            <Button title="개인정보처리방침" variant="text" onPress={() => void Linking.openURL(PRIVACY_URL)} />
          </View>
        </>
      )}
      {view.kind === "store" && (
        <>
          <Text style={styles.body}>
            {view.canceling
              ? `${formatDate(view.until)}에 구독이 종료돼요`
              : `${storeName(view.store)} 구독 중이에요. 다음 결제일은 ${formatDate(view.until)}이에요`}
          </Text>
          {manageButton}
        </>
      )}
      {view.kind === "external" && (
        <Text style={styles.body}>다른 기기나 웹에서 관리할 수 있어요. {formatDate(view.until)}까지 이용할 수 있어요</Text>
      )}
      {view.kind === "trialing" && <Text style={styles.body}>무료 체험 중이에요. {formatDate(view.until)}까지 이용할 수 있어요</Text>}
      {view.kind === "pastDue" && (
        <>
          <Text style={styles.body}>결제 수단을 확인해 주세요</Text>
          {view.store && manageButton}
        </>
      )}
      {notice && (
        <>
          <Text style={styles.warning}>{notice}</Text>
          {manageButton}
        </>
      )}
      {restoreMessage && <Text style={styles.small}>{restoreMessage}</Text>}
      {lastError && <Text style={styles.warning}>{ERROR_TEXT[lastError]}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.background.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: { fontSize: 13, color: colors.text.tertiary },
  body: { fontSize: 16, color: colors.text.primary },
  small: { fontSize: 12, color: colors.text.secondary },
  warning: { fontSize: 14, color: colors.danger.text },
  links: { flexDirection: "row", justifyContent: "center", gap: spacing.md },
});

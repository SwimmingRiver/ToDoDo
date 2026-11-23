import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { openTodoDetail } from "../../navigation/navigationRef";

export const BANNER_DURATION_MS = 4000;

type BannerContextValue = { show: (title: string, body: string, todoId?: string) => void };

const ReminderBannerContext = createContext<BannerContextValue>({ show: () => {} });

export const useReminderBanner = (): BannerContextValue => useContext(ReminderBannerContext);

export const ReminderBannerProvider = ({ children }: { children: ReactNode }) => {
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<{ title: string; body: string; todoId?: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const dismiss = useCallback(() => {
    clearTimer();
    setBanner(null);
  }, []);
  const show = useCallback((title: string, body: string, todoId?: string) => {
    clearTimer();
    setBanner({ title, body, todoId });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setBanner(null);
    }, BANNER_DURATION_MS);
  }, []);
  useEffect(() => clearTimer, []);
  // 시스템 알림을 눌렀을 때와 같게, 할 일이 있으면 상세로 이동한다.
  const handlePress = () => {
    const todoId = banner?.todoId;
    dismiss();
    if (todoId) openTodoDetail(todoId);
  };

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ReminderBannerContext.Provider value={value}>
      {children}
      {banner && (
        <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + spacing.sm }]}>
          <Pressable
            accessibilityRole="alert"
            accessibilityLabel={`${banner.title}. ${banner.body}`}
            onPress={handlePress}
            style={styles.banner}
          >
            <Text style={styles.title} numberOfLines={1}>
              {banner.title}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {banner.body}
            </Text>
          </Pressable>
        </View>
      )}
    </ReminderBannerContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlay: { position: "absolute", left: spacing.lg, right: spacing.lg },
  banner: {
    backgroundColor: colors.background.primary,
    borderColor: colors.border.tertiary,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  title: { color: colors.text.primary, fontSize: 15, fontWeight: "600" },
  body: { color: colors.text.secondary, fontSize: 14, marginTop: spacing.xs },
});

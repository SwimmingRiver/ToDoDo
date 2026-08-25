import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { radius } from "../../../theme/spacing";

interface OverdueBadgeProps {
  /** "N일 초과"로 렌더링 */
  daysOver: number;
}

/** 웹 ProjectCard의 OverdueBadge("N일 초과")에 대응. */
export const OverdueBadge = ({ daysOver }: OverdueBadgeProps) => {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{daysOver}일 초과</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.md,
    backgroundColor: colors.danger.background,
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.danger.text,
  },
});

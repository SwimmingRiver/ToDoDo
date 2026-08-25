import { StyleSheet, View } from "react-native";
import { colors } from "../../../theme/colors";

interface ProgressBarProps {
  /** 0~100 */
  progress: number;
  /** true면 danger.main, 아니면 brand.fill */
  isOverdue?: boolean;
}

/** 웹 ProjectCard의 ProgressBar/ProgressFill(3px 높이)에 대응. */
export const ProgressBar = ({ progress, isOverdue }: ProgressBarProps) => {
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          {
            width: `${Math.max(0, Math.min(100, progress))}%`,
            backgroundColor: isOverdue ? colors.danger.main : colors.brand.fill,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: 3,
    backgroundColor: colors.background.secondary,
  },
  fill: {
    height: "100%",
  },
});

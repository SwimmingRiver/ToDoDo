import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { PERIOD_PRESETS, PERIOD_TAB_LABELS, type InsightsFilter, type ProjectOption } from "@tododo/core";
import { BottomSheet } from "../../shared/ui/bottomSheet/BottomSheet";
import { colors } from "../../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../theme/spacing";

interface InsightsFilterBarProps {
  filter: InsightsFilter;
  projects: ProjectOption[];
  onChange: (next: InsightsFilter) => void;
}

const ALL_PROJECTS = "__all__";
const ALL_PROJECTS_LABEL = "전체 프로젝트";

const projectLabel = (project: ProjectOption) => (project.isDone ? `${project.title} (완료)` : project.title);

const InsightsFilterBar = ({ filter, projects, onChange }: InsightsFilterBarProps) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const selectedProject = projects.find((project) => project.id === filter.projectId);
  const currentLabel = selectedProject ? projectLabel(selectedProject) : ALL_PROJECTS_LABEL;

  const options = [
    { value: ALL_PROJECTS, label: ALL_PROJECTS_LABEL },
    ...projects.map((project) => ({ value: project.id, label: projectLabel(project) })),
  ];

  return (
    <View style={styles.bar}>
      <View style={styles.tabList} accessibilityRole="tablist">
        {PERIOD_PRESETS.map((period) => {
          const selected = filter.period === period;
          return (
            <Pressable
              key={period}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange({ ...filter, period })}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{PERIOD_TAB_LABELS[period]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="프로젝트"
        onPress={() => setIsSheetOpen(true)}
        style={styles.projectButton}
      >
        <Text style={styles.projectText} numberOfLines={1}>
          {currentLabel}
        </Text>
        <ChevronDown size={18} color={colors.text.tertiary} />
      </Pressable>
      <BottomSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title="프로젝트"
        options={options}
        selectedValue={filter.projectId ?? ALL_PROJECTS}
        onSelect={(value) => onChange({ ...filter, projectId: value === ALL_PROJECTS ? null : value })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { gap: spacing.md },
  tabList: {
    flexDirection: "row",
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  tabSelected: { backgroundColor: colors.brand.strong },
  tabText: { fontSize: 14, fontWeight: "500", color: colors.text.secondary },
  tabTextSelected: { color: "#FFFFFF", fontWeight: "600" },
  projectButton: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.tertiary,
    borderRadius: radius.lg,
  },
  projectText: { flex: 1, fontSize: 14, color: colors.text.primary },
});

export default InsightsFilterBar;
export type { InsightsFilterBarProps };

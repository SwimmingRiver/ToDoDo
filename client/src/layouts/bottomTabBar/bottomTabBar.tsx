import { Sun, ListChecks, CalendarCheckIcon, KanbanIcon } from "lucide-react";
import { TabNavLink, TabBarContainer } from "./bottomTabBar.styles";

const TAB_ITEMS = [
  { path: "/today", icon: Sun, label: "오늘" },
  { path: "/todo", icon: ListChecks, label: "목록" },
  { path: "/calendar", icon: CalendarCheckIcon, label: "캘린더" },
  { path: "/kanban", icon: KanbanIcon, label: "칸반" },
] as const;

const BottomTabBar = () => {
  return (
    <TabBarContainer role="navigation" aria-label="하단 탭 메뉴">
      {TAB_ITEMS.map(({ path, icon: Icon, label }) => (
        <TabNavLink key={path} to={path} aria-label={label}>
          <Icon size={20} />
          <span>{label}</span>
        </TabNavLink>
      ))}
    </TabBarContainer>
  );
};

export default BottomTabBar;

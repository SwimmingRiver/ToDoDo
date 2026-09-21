import { PERIOD_PRESETS, PERIOD_TAB_LABELS, type InsightsFilter, type ProjectOption } from "@tododo/core";
import { Bar, TabList, TabButton, ProjectSelect } from "./insightsFilterBar.styles";

interface InsightsFilterBarProps {
  filter: InsightsFilter;
  projects: ProjectOption[];
  onChange: (next: InsightsFilter) => void;
}

const ALL_PROJECTS_VALUE = "";

const InsightsFilterBar = ({ filter, projects, onChange }: InsightsFilterBarProps) => (
  <Bar>
    <TabList role="tablist" aria-label="기간">
      {PERIOD_PRESETS.map((period) => (
        <TabButton
          key={period}
          type="button"
          role="tab"
          aria-selected={filter.period === period}
          $active={filter.period === period}
          onClick={() => onChange({ ...filter, period })}
        >
          {PERIOD_TAB_LABELS[period]}
        </TabButton>
      ))}
    </TabList>
    <ProjectSelect
      aria-label="프로젝트"
      value={filter.projectId ?? ALL_PROJECTS_VALUE}
      onChange={(event) =>
        onChange({ ...filter, projectId: event.target.value === ALL_PROJECTS_VALUE ? null : event.target.value })
      }
    >
      <option value={ALL_PROJECTS_VALUE}>전체 프로젝트</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.isDone ? `${project.title} (완료)` : project.title}
        </option>
      ))}
    </ProjectSelect>
  </Bar>
);

export default InsightsFilterBar;
export type { InsightsFilterBarProps };

import { useState } from "react";
import { Navigate } from "react-router-dom";
import { FEEDBACK_STATUS_LABEL, type FeedbackStatus } from "../api";
import { useFeedbackList, useIsOperator } from "../hooks";
import FeedbackAdminItem from "../components/feedbackAdminItem";
import {
  FeedbackAdminContainer,
  FeedbackAdminBody,
  FilterBar,
  FilterButton,
  EmptyText,
  MoreButton,
} from "./feedbackAdminPage.styles";

type Filter = "all" | FeedbackStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "new", label: FEEDBACK_STATUS_LABEL.new },
  { value: "planned", label: FEEDBACK_STATUS_LABEL.planned },
  { value: "done", label: FEEDBACK_STATUS_LABEL.done },
  { value: "wontfix", label: FEEDBACK_STATUS_LABEL.wontfix },
];

// 디스코드 링크로만 진입하는 운영자 전용 화면. 사이드바·드로어에는 링크를 두지 않는다.
const FeedbackAdminPage = () => {
  const { isOperator, isLoading } = useIsOperator();
  const { data, isError, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } = useFeedbackList(isOperator);
  const [filter, setFilter] = useState<Filter>("new");

  if (isLoading) return null;
  if (!isOperator) return <Navigate to="/today" replace />;

  const all = data?.pages.flatMap((page) => page.items) ?? [];
  const visible = all.filter((item) => filter === "all" || item.status === filter);

  return (
    <FeedbackAdminContainer>
      <FeedbackAdminBody>
        <FilterBar>
          {FILTERS.map(({ value, label }) => (
            <FilterButton key={value} type="button" $active={filter === value} onClick={() => setFilter(value)}>
              {label}
            </FilterButton>
          ))}
        </FilterBar>
        {isError && (
          <EmptyText role="alert">의견을 불러오지 못했습니다. 다시 로그인하거나 잠시 후 새로고침해 주세요.</EmptyText>
        )}
        {isPending && !isError && <EmptyText>불러오는 중…</EmptyText>}
        {data && visible.length === 0 && <EmptyText>의견이 없습니다</EmptyText>}
        {visible.map((item) => (
          <FeedbackAdminItem key={item.id} item={item} />
        ))}
        {hasNextPage && (
          <MoreButton type="button" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? "불러오는 중…" : "더 보기"}
          </MoreButton>
        )}
      </FeedbackAdminBody>
    </FeedbackAdminContainer>
  );
};

export default FeedbackAdminPage;

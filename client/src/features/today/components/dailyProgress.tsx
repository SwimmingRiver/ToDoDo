import {
  Container,
  Header,
  DateLabel,
  CompletionLabel,
  ProgressBarTrack,
  ProgressBarFill,
} from "./dailyProgress.styles";

interface DailyProgressProps {
  dateLabel: string;
  doneCount: number;
  totalCount: number;
}

const DailyProgress = ({
  dateLabel,
  doneCount,
  totalCount,
}: DailyProgressProps) => {
  const percentage = totalCount === 0 ? 0 : (doneCount / totalCount) * 100;

  return (
    <Container>
      <Header>
        <DateLabel>{dateLabel}</DateLabel>
        <CompletionLabel>
          {doneCount} / {totalCount} 완료
        </CompletionLabel>
      </Header>
      <ProgressBarTrack>
        <ProgressBarFill style={{ width: `${percentage}%` }} />
      </ProgressBarTrack>
    </Container>
  );
};

export default DailyProgress;

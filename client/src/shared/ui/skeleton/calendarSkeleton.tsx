import {
  Container,
  Toolbar,
  ToolbarTitle,
  ToolbarButtons,
  ToolbarButton,
  WeekdayRow,
  Weekday,
  Grid,
  Cell,
  DayNumber,
  EventBar,
} from "./calendarSkeleton.styles";

const WEEKS = 6;
const DAYS_IN_WEEK = 7;
const CELL_COUNT = WEEKS * DAYS_IN_WEEK;

// 셀마다 이벤트 바를 몇 개 그릴지. 실제 달력처럼 듬성듬성 차 있도록 고정 패턴을
// 반복한다(랜덤을 쓰면 리렌더마다 모양이 바뀌어 깜빡임으로 보인다).
const eventCounts = [0, 1, 0, 2, 1, 0, 1];
const eventWidths = ["80%", "60%", "90%", "70%"];

const CalendarSkeleton = () => (
  <Container aria-hidden="true">
    <Toolbar>
      <ToolbarTitle />
      <ToolbarButtons>
        <ToolbarButton />
        <ToolbarButton />
      </ToolbarButtons>
    </Toolbar>

    <WeekdayRow>
      {Array.from({ length: DAYS_IN_WEEK }, (_, i) => (
        <Weekday key={i} />
      ))}
    </WeekdayRow>

    <Grid>
      {Array.from({ length: CELL_COUNT }, (_, i) => (
        // 같은 주(행) 안의 셀들이 동시에 밝아지지 않도록 열 단위로 지연을 준다.
        <Cell key={i} $delay={(i % DAYS_IN_WEEK) * 0.1}>
          <DayNumber />
          {Array.from({ length: eventCounts[i % eventCounts.length] }, (_, j) => (
            <EventBar key={j} $width={eventWidths[(i + j) % eventWidths.length]} />
          ))}
        </Cell>
      ))}
    </Grid>
  </Container>
);

export default CalendarSkeleton;

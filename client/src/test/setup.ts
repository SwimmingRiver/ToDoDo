import '@testing-library/jest-dom'

// CI가 UTC로 돌면 타임존 의존 테스트가 공허하게 통과할 수 있다.
// 외부에서 TZ를 지정하지 않았다면 비-UTC로 고정해 로컬/CI 결과를 일치시킨다.
// (CI는 TZ=America/New_York으로 한 번 더 돌려 음수 오프셋도 검증한다)
process.env.TZ ||= 'Asia/Seoul'

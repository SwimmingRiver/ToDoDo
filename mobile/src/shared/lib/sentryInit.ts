// 부수효과 전용 모듈. import 선언은 끌어올려져(호이스팅) 본문 코드보다 먼저 평가되므로,
// App.tsx 본문에서 initSentry()를 부르면 firebase 등 다른 import가 먼저 실행된다.
// 이 모듈을 App.tsx의 첫 import로 두어 Sentry가 실제로 가장 먼저 켜지게 한다.
import { initSentry } from "./sentry";

initSentry();

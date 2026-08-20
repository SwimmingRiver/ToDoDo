import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { runStartupMaintenance } from "../api";

// 앱 진입 시 1회 호출하는 백그라운드 유지보수(App.tsx). 완료 프로젝트 아카이빙,
// 지난 반복 인스턴스 아카이빙, 무기한 반복 시리즈 확장을 한 번의 읽기로 처리한다.
// 사용자 액션이 아니라 유지보수 성격이라 사용자에게는 조용히 넘어가고(다음 접속 때
// 다시 시도됨), 실패 자체를 아무도 모르면 운영 중 문제를 감지할 수 없으므로 최소한
// 콘솔에는 남긴다.
//
// 무효화를 written > 0으로 거는 이유: 세 정책 모두 대부분의 실행에서 쓸 것이 없다.
// 무조건 무효화하면 하는 일 없이 getTodos() 전체 재조회를 유발한다. 쓴 것이 없으면
// 서버 데이터가 이 유지보수 때문에 바뀐 게 없으므로 캐시는 이미 최신이다.
export const useRunStartupMaintenance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => runStartupMaintenance(),
    onSuccess: (written) => {
      if (written > 0) {
        queryClient.invalidateQueries({ queryKey: ["todos"] });
      }
    },
    onError: (error) => {
      console.error("앱 진입 유지보수 실패:", error);
      Sentry.captureException(error);
    },
  });
};

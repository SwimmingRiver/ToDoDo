# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## 환경 변수 (회원 탈퇴)

계정 삭제는 세 프록시를 모두 호출한다. 아래 변수가 `mobile/.env`와 EAS 환경 양쪽에 설정돼 있어야 하며, 하나라도 비면 회원 탈퇴가 항상 실패한다.

- `EXPO_PUBLIC_CALENDAR_PROXY_URL`
- `EXPO_PUBLIC_REMINDER_PROXY_URL`
- `EXPO_PUBLIC_BILLING_PROXY_URL`

### AI 할 일 플랜

AI 할 일 플랜 화면은 `EXPO_PUBLIC_AI_PROXY_URL`도 `mobile/.env`와 EAS 환경 양쪽에 있어야 한다. 비어 있으면 「계획 만들기」가 항상 일반 오류 문구로 실패한다.

### 구글 캘린더 연동

캘린더 연결·해제·동기화도 `EXPO_PUBLIC_CALENDAR_PROXY_URL`을 쓴다(위 탈퇴용과 같은 값). 비어 있으면 연결 시작이 항상 실패한다. OAuth는 `tododo://calendar` 딥링크로 복귀하므로 `app.json`의 `"scheme": "tododo"`가 들어간 네이티브 빌드가 필요하다(scheme 추가 전 빌드로는 복귀하지 않는다).

# reminder-proxy

마감 알림(웹 푸시) Worker. 사용자마다 `ReminderScheduler` Durable Object 1개가 알람으로 발송 시각을 예약한다. 설계: `docs/superpowers/specs/2026-09-27-deadline-reminders-design.md`.

## 엔드포인트 (모두 `Authorization: Bearer <Firebase ID 토큰>`)

| 메서드·경로 | 본문 | 응답 |
|---|---|---|
| `POST /push-tokens` | `{ token, platform: "web" }` | 204 |
| `DELETE /push-tokens` | `{ token }` | 204 |
| `POST /reminders/refresh` | 없음 | 202 |

## 배포 준비 (최초 1회, 순서 중요)

1. **서비스 계정**: Google Cloud 콘솔(프로젝트 `tododo-83576`) > IAM > 서비스 계정 만들기. 역할 `Cloud Datastore User`, `Firebase Cloud Messaging API Admin`. 키(JSON) 발급. API 및 서비스에서 `Firebase Cloud Messaging API`가 사용 설정인지 확인. 결제 등록은 필요 없다.
2. **VAPID 키**: Firebase 콘솔 > 프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서 > 키 쌍 생성. 공개키를 `VITE_FIREBASE_VAPID_KEY`로 `client/.env`와 GitHub Secrets에 넣는다.
3. **Worker 코드 먼저 배포**: `npm run deploy`(또는 main 병합 후 CI). 출력된 URL을 `VITE_REMINDER_PROXY_URL`로 `client/.env`와 GitHub Secrets에 넣는다.
4. **시크릿**: 사용자 터미널에서 직접 실행한다(이 저장소의 에이전트 셸은 비대화형이라 입력을 받지 못한다).
   ```bash
   cd reminder-proxy && npx wrangler secret put GOOGLE_SERVICE_ACCOUNT < /path/to/service-account.json
   ```
   코드 배포 전에 시크릿을 넣으면 코드 없는 빈 Worker가 생긴다.
5. Firestore 규칙·색인은 main 배포 시 CI가 함께 배포한다. `userId + dueAt` 색인이 빌드되기 전(수 분)에는 재계산이 `FAILED_PRECONDITION`으로 실패하고 알람이 재시도한다.

## 로컬 테스트

```bash
cp /path/to/service-account.json .  # 커밋 금지
printf 'GOOGLE_SERVICE_ACCOUNT=%s\n' "$(jq -c . service-account.json)" > .dev.vars
npx wrangler dev   # http://localhost:8787
```
`client/.env.local`에 `VITE_REMINDER_PROXY_URL=http://localhost:8787`. 알림 클릭 링크는 `CLIENT_APP_URL`(배포 주소)로 열린다.

## 알고 감수한 한계
스펙 §9 참고(웹 외 경로의 늦은 반영, 브라우저 실행 필요, 제목이 FCM 경유, iOS 브라우저 미지원, Firestore 무료 읽기 한도, 자정 마감).

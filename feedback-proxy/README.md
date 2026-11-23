# feedback-proxy

고객 의견 제출(`POST /feedback`)을 받아 Firestore `feedback` 컬렉션에 저장하고 Discord로 알리는 Cloudflare Worker.

- 인증: Firebase ID 토큰(`Authorization: Bearer`). 토큰의 `email` 클레임이 있으면 함께 저장한다.
- 입력: `{ content, platform }` — content는 trim 후 1~1000자, platform은 `web | ios | android`.
- 제한: uid별 제출 60초 3회(`FEEDBACK_SUBMIT_LIMIT`), 전역 Discord 알림 60초 10건(`FEEDBACK_NOTIFY_LIMIT`). 바인딩 장애 시 통과(fail-open).
- Discord 알림에는 의견 내용·이메일·uid를 넣지 않는다. 실패해도 제출은 201.

## 로컬 테스트

```
npm install
npm test
npm run typecheck
```

## 배포 준비

1. 시크릿 등록 (본인 터미널에서 직접 실행 — 대화형 입력이 필요하다)
   ```
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
   npx wrangler secret put DISCORD_WEBHOOK_URL
   ```
   - `GOOGLE_SERVICE_ACCOUNT`: billing-proxy와 같은 Firestore 쓰기 권한 서비스 계정 JSON(Cloud Datastore User).
   - `DISCORD_WEBHOOK_URL`: Discord 채널 설정 → 연동 → 웹후크 만들기 → URL 복사.
2. 배포
   ```
   npm run deploy
   ```
3. 확인
   ```
   curl -i -X OPTIONS https://<워커 주소>/feedback -H "Origin: <CLIENT_APP_URL>"
   ```
   `204`와 `Access-Control-Allow-Origin` 헤더가 보이면 정상이다.

# feedback-proxy

고객 의견 제출을 받아 Firestore `feedback` 컬렉션에 저장하고 Discord로 알리는 Cloudflare Worker.
(`POST /feedback` 핸들러·Discord 알림·배포 절차는 이후 작업에서 채운다.)

## 로컬 테스트

```
npm install
npm test
npm run typecheck
```

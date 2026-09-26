# ai-proxy

AI 할 일 플랜 생성 Worker(`POST /plan`). 설계: `docs/superpowers/specs/2026-09-25-ai-plan-design.md`.

## 배포 준비(최초 1회, main 병합 **전에** 전부 끝낸다)

main push 한 번으로 ai-proxy 배포와 client Hosting 빌드가 같이 돈다. Hosting 빌드가
`VITE_AI_PROXY_URL`을 그 시점에 굽기 때문에, 아래 1~4를 병합 전에 끝내지 않으면
클라이언트가 잘못된(또는 빈) Worker URL로 빌드된다.

1. KV 생성: `npx wrangler kv namespace create AI_USAGE` → 출력된 id를 `wrangler.toml`의 `REPLACE_WITH_AI_USAGE_KV_ID` 자리에 넣고 커밋.
2. Anthropic Console에서 API 키 발급. 월 사용 한도(spend limit) 설정은 **필수**다 — 실패한 호출(거부/max_tokens/잘못된 출력)은 사용량 카운터에 잡히지 않으므로, 이 한도가 없으면 반복 실패 유발로 비용이 무제한 늘 수 있다.
3. 시크릿 등록(사용자 본인 터미널에서, Claude Code 셸은 비대화형이라 불가): `npx wrangler secret put ANTHROPIC_API_KEY`.
4. Worker URL을 확정한다. `https://tododo-ai-proxy.<account-subdomain>.workers.dev` 형태로 예측 가능하고, 확실히 하려면 `npx wrangler deploy`로 로컬에서 한 번 수동 배포해 출력을 확인한다. 이 URL을 GitHub Secret `VITE_AI_PROXY_URL`과 `client/.env`에 등록한다.

## 설정(wrangler.toml vars)

- `AI_MODEL`: 기본 `claude-haiku-4-5`
- `DAILY_LIMIT`: 사용자당 하루 성공 횟수 한도(서울 기준 날짜), 기본 `20`

## 알고 감수한 한계

- KV 카운터는 게이트 체크 이후 쓰기 직전에 최신값을 다시 읽어 쓰지만, KV get/put 자체가 원자적이지 않아 재조회~쓰기 사이 수 ms 창에서 완전히 동시에 끝나는 요청은 하루 한도를 소폭 넘길 수 있다. 결제 도입 시 Durable Object 전환을 다시 검토한다.
- 실패한 호출(거부/max_tokens/잘못된 출력 → 502)은 사용량 카운터에 잡히지 않는다. 프리미엄 사용자가 실패를 반복 유발하면 호출당 최대 약 4k 출력 토큰을 한도 없이 소모시킬 수 있다. 프리미엄을 수동으로만 부여하는 지금은 감수하지만, 결제로 프리미엄을 공개 판매하기 전에는 반드시 닫아야 한다(예: 별도의 느슨한 시도 횟수 상한). 그 전까지는 위 배포 준비의 Anthropic Console 월 사용 한도가 최후 방어선이다.
- `premium` 커스텀 클레임은 ID 토큰이 갱신될 때까지 최대 1시간 늦게 반영된다.
- 기존 할 일이나 연동된 구글 캘린더 일정을 보지 않으므로 이미 바쁜 날을 피해서 계획을 짜지 못한다(의도한 범위 결정). 사용자가 미리보기에서 날짜를 직접 조정한다.

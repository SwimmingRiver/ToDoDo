# ai-proxy

AI 할 일 플랜 생성 Worker(`POST /plan`). 설계: `docs/superpowers/specs/2026-09-25-ai-plan-design.md`.

## 배포 준비(최초 1회, 사용자 본인 터미널에서)

1. KV 생성: `npx wrangler kv namespace create AI_USAGE` → 출력된 id를 `wrangler.toml`의 `REPLACE_WITH_AI_USAGE_KV_ID` 자리에 넣고 커밋.
2. Anthropic Console에서 API 키 발급. 월 사용 한도(spend limit)도 설정 권장.
3. 시크릿 등록: `npx wrangler secret put ANTHROPIC_API_KEY`. 대화형 입력이라 Claude Code의 셸이 아니라 본인 터미널에서 실행.
4. 첫 배포는 main 병합 시 CI가 수행한다. 배포 URL(`https://tododo-ai-proxy.<subdomain>.workers.dev`)을 GitHub Secret `VITE_AI_PROXY_URL`과 `client/.env`에 넣는다.

## 설정(wrangler.toml vars)

- `AI_MODEL`: 기본 `claude-haiku-4-5`
- `DAILY_LIMIT`: 사용자당 하루 성공 횟수 한도(서울 기준 날짜), 기본 `20`

## 알고 감수한 한계

- KV 카운터는 원자적이지 않다. 동시 요청 시 하루 한도를 1~2회 넘길 수 있다. 결제 도입 시 Durable Object 전환을 다시 검토한다.
- `premium` 커스텀 클레임은 ID 토큰이 갱신될 때까지 최대 1시간 늦게 반영된다.

# Client (React + Vite)

client 폴더의 코드 컨벤션, 디자인 토큰, 데이터 모델을 정의합니다.

## 코드 컨벤션

- TypeScript strict 모드 (tsconfig.app.json)
- styled-components로 스타일 관리
- TanStack Query (React Query)로 서버 상태 관리
- Vite 빌드 시스템

## 디자인 토큰

`src/styles/tokens.ts`에 정의된 색상, 타이포그래피, 간격 등을 참고하세요.

## 데이터 모델

### entitlements

사용자의 프리미엄 엔타이틀먼트 정보. Firestore 문서 경로: `entitlements/{uid}`.

**필드:**
- `plan`: "premium" | "free" - 사용자의 구독 플랜
- `status`: "active" | "none" - 활성화 상태
- `source`: "manual" | "webhook" - 부여 출처
- `updatedAt`: ISO 8601 문자열 - 마지막 갱신 시각

**부여/회수 방법:**

지금은 운영자가 `scripts/grantEntitlement.ts`(`npm run grant:entitlement -- --uid <uid> --plan premium|free`)로 문서와 Firebase Auth 커스텀 클레임(`premium`)을 함께 설정하고, 결제 웹훅이 붙기 전까지는 이 상태로 유지된다. `firestore.rules`와 calendar-proxy는 이 문서가 아니라 커스텀 클레임을 읽어 서버 사이드로 프리미엄 여부를 강제한다.

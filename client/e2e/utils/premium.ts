import type { Page, APIRequestContext } from '@playwright/test'

const EMULATOR_PROJECT_ID = 'demo-tododo-e2e'

/**
 * 에뮬레이터 Firestore에 현재 로그인 사용자의 entitlements 문서를 직접 쓴다.
 * 규칙상 클라이언트는 이 문서를 쓸 수 없으므로(write:false), 에뮬레이터 REST에
 * `Bearer owner`(규칙 우회)로 쓴다. 이 경로는 에뮬레이터 전용이다.
 * UI 잠금 판정(useIsPremium)만 풀면 되고, ai-proxy는 page.route로 가로채므로
 * 커스텀 클레임은 필요 없다.
 */
export async function grantPremiumInEmulator(page: Page, request: APIRequestContext): Promise<void> {
  const uid = await page.evaluate(async () => {
    // @ts-expect-error 브라우저에서만 resolve되는 dev 서버 경로
    const mod = await import('/src/shared/lib/firebase.ts')
    return mod.auth.currentUser?.uid as string | undefined
  })
  if (!uid) throw new Error('로그인된 사용자가 없습니다')

  const url = `http://127.0.0.1:8080/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents/entitlements/${uid}`
  const res = await request.patch(url, {
    headers: { Authorization: 'Bearer owner' },
    data: {
      fields: {
        plan: { stringValue: 'premium' },
        status: { stringValue: 'active' },
        source: { stringValue: 'manual' },
        updatedAt: { stringValue: new Date().toISOString() },
      },
    },
  })
  if (!res.ok()) throw new Error(`entitlement 시드 실패: ${res.status()}`)
}

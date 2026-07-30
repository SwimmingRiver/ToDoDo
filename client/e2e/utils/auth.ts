import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Firebase Auth 에뮬레이터(playwright.config.ts에서 기동)에 실제로
 * signInAnonymously를 호출해 인증된 세션을 만든다.
 *
 * 왜 storageState로 미리 저장해두지 않는가: Firebase Auth JS SDK는 세션을
 * IndexedDB에 저장하는데, Playwright의 context.storageState()는 cookie와
 * localStorage만 캡처하고 IndexedDB는 캡처하지 못한다. 그래서 매 테스트(=매
 * 브라우저 컨텍스트)마다 새로 로그인한다 — 부수 효과로 테스트마다 익명 사용자
 * uid가 달라져 Firestore 데이터가 테스트 간에 완전히 격리된다.
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  // 앱(및 firebase.ts의 싱글턴 auth/db)이 부트스트랩되도록 아무 라우트나 먼저 연다.
  await page.goto('/login')

  await page.evaluate(async () => {
    // Vite dev 서버가 서빙하는 절대 경로를 브라우저 런타임에서 직접 동적
    // import한다. 정적 타입 해석 대상이 아니므로(e2e/는 tsconfig.app.json의
    // include에도 포함되지 않는다) 타입 에러를 억제한다.
    // @ts-expect-error 브라우저에서만 resolve되는 dev 서버 경로
    const mod = await import('/src/features/auth/testUtils/e2eAuth.ts')
    await mod.e2eSignIn()
  })

  // onAuthStateChanged가 비동기로 반영되므로, 보호된 라우트로 이동해 리다이렉트
  // 없이 들어가지는지로 로그인 완료를 확인한다.
  await page.goto('/today')
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 })
}

// mock 없이 실제 SDK로 확인한다 — 미리 준비가 의미 있으려면 내부 _getInstance가
// signInWithPopup이 쓰는 것과 같은 @firebase/auth 사본의 같은 처리기 인스턴스를 돌려줘야 한다.
// firebase 업그레이드로 사본이 갈라지거나 내부 이름이 바뀌면 여기서 실패한다(warmUpPopup.ts).
// 테스트 환경은 Node용 빌드로 연결돼 팝업 처리기가 빈 객체이므로, 브라우저용 빌드 파일을 경로로 직접 불러온다.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const authPackageJson = require.resolve('@firebase/auth/package.json')
const authDir = dirname(authPackageJson)

describe('warmUpPopup이 기대는 SDK 내부 계약', () => {
  it('firebase가 쓰는 @firebase/auth와 앱이 직접 import하는 @firebase/auth가 같은 사본이다', () => {
    const firebaseDir = dirname(require.resolve('firebase/package.json'))
    expect(require.resolve('@firebase/auth/package.json', { paths: [firebaseDir] })).toBe(authPackageJson)
  })

  it('브라우저 빌드에서 _getInstance는 처리기 클래스마다 같은 인스턴스를 돌려주고 _initialize가 있다', async () => {
    const browser = await import(/* @vite-ignore */ pathToFileURL(join(authDir, 'dist/esm/index.js')).href)
    const internal = await import(/* @vite-ignore */ pathToFileURL(join(authDir, 'dist/esm/internal.js')).href)
    const first = internal._getInstance(browser.browserPopupRedirectResolver)
    expect(first).toBe(internal._getInstance(browser.browserPopupRedirectResolver))
    expect(typeof first._initialize).toBe('function')
  })
})

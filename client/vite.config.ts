import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Sentry Auth Token은 절대 VITE_ 접두사를 붙이지 않는다. VITE_ 접두사가 붙으면
// Vite가 import.meta.env를 통해 브라우저 번들에 그대로 노출시키기 때문이다. 이 값은
// 이 파일(빌드 타임 Node 프로세스)에서만 읽히며, .env/VITE_* 체계와는 완전히 분리된
// GitHub Actions repo secrets(SENTRY_AUTH_TOKEN)로만 주입해야 한다. 로컬 .env에는
// 절대 넣지 말 것.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 소스맵을 Sentry에 업로드하는 플러그인. authToken이 없으면(로컬 개발, CI의
    // client 테스트 빌드) 플러그인이 자체적으로 "No auth token provided" 경고만
    // 남기고 업로드를 스킵한다(라이브러리 기본 동작) — 빌드 자체는 항상 정상적으로
    // 끝난다. authToken이 있는데도 업로드가 실패하는 경우(Sentry 프로젝트 미생성,
    // 네트워크 오류 등)에도 errorHandler가 throw 대신 경고만 남기도록 해 배포 빌드
    // (deploy job)가 소스맵 업로드 실패만으로 깨지지 않게 한다.
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: sentryAuthToken,
      errorHandler: (error) => {
        console.warn('[sentry-vite-plugin] 소스맵 업로드 실패, 빌드는 계속 진행합니다:', error)
      },
      // release.name을 명시하지 않으면 플러그인이 자동으로 git HEAD의 커밋 SHA를
      // 사용한다(CI/로컬 모두 git 정보로 충분히 식별 가능하므로 별도 지정 불필요).
      sourcemaps: {
        // 업로드가 끝난 뒤 dist에서 .map 파일을 삭제해, 배포된 사이트에서
        // 소스맵이 공개적으로 서빙되지 않도록 한다.
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
      telemetry: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    // @tododo/core는 file: 심링크(packages/core)라 그 안의 실제 경로 기준으로
    // firebase를 다시 찾는다 — packages/core가 자기 devDependencies로 별도 설치한
    // firebase(테스트용)와 client의 firebase가 서로 다른 모듈 인스턴스로 번들에
    // 두 번 들어가, Firestore/Auth 클래스가 갈라져 `instanceof` 검사가 깨질 수
    // 있다(모바일 Metro에서 겪은 것과 같은 종류의 문제). dedupe로 항상 client
    // 쪽 firebase 하나로 강제한다.
    dedupe: ['firebase'],
  },
  build: {
    // Sentry 플러그인이 업로드할 소스맵을 Vite가 실제로 생성하도록 한다. 위
    // filesToDeleteAfterUpload는 업로드 성공/스킵 여부와 무관하게 항상 실행되므로
    // (@sentry/bundler-plugins의 deleteArtifacts가 finally 블록에서 동작), authToken이
    // 없는 로컬/client 빌드를 포함해 모든 경우에 .map 파일은 최종 dist에 남지 않는다.
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // 기본값(테스트 파일마다 CPU 코어 수만큼 워커 프로세스를 fork)은 각 워커가
    // jsdom + styled-components + FullCalendar 같은 무거운 동기 렌더링을 수행할 때
    // 코어 수만큼 동시 실행되며 서로 CPU를 놓고 경합한다. 이 경합이 심해지면(특히
    // GitHub Actions처럼 공유 vCPU 환경) userEvent 클릭 한 번이나 캘린더 렌더링
    // 같은 원래 수백 ms짜리 동작이 수 초로 늘어나 기본 testTimeout(5000ms)을 넘겨
    // 간헐적으로 실패한다(calendar/kanbanCardMenu/statusSelect 테스트에서 재현됨).
    // 워커 수를 코어 수의 절반으로 제한하면 워커당 가용 CPU가 늘어 총 실행 시간도
    // 오히려 줄고, 순간적인 CPU 경합에 대한 여유(margin)가 생겨 타임아웃을 피한다.
    maxWorkers: Math.max(2, Math.floor(os.cpus().length / 2)),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
})

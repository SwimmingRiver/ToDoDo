import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
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

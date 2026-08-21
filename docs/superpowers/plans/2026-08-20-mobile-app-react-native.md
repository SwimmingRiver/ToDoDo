# 모바일 앱(React Native) 출시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ToDoDo의 핵심 할일 관리 기능(로그인, 목록, CRUD, 상태변경, 로컬 알림)을 React Native(Expo) 앱으로 만들어 스토어에 낼 수 있는 상태까지 만든다.

**Architecture:** `packages/core`에 Firestore CRUD 함수를 새로 작성해 웹(`client/`)과 모바일(`mobile/`)이 공유할 수 있는 형태로 두고, `mobile/`은 Expo 기반 신규 앱으로 이 함수들을 소비한다. `client/`의 기존 `todoApi.ts`는 이번 계획에서 건드리지 않는다 — 실서비스 코드라 회귀 리스크를 최소화하기 위함(아래 Global Constraints 참고).

**Tech Stack:** Expo(React Native), React Navigation, Firebase JS SDK(`firebase` ^12.10.0), TanStack Query(`@tanstack/react-query` ^5.90.5), `@react-native-google-signin/google-signin`, `expo-notifications`, TypeScript(`~5.8.3`), Jest + React Native Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-20-mobile-app-react-native-design.md`

## Global Constraints

- `client/`, `server/`, `docker-compose.yml`은 이 계획의 어떤 태스크에서도 수정하지 않는다 (CLAUDE.md: server/docker-compose는 실제 서비스와 무관, client는 실서비스라 회귀 리스크 최소화).
- 루트 `package.json`은 수정하지 않는다 — npm workspaces로 전환하지 않고, `packages/core`는 각 소비자(`mobile/`, 추후 `client/`)의 `package.json`에 `"@tododo/core": "file:../packages/core"`로 로컬 의존성 연결한다.
- `packages/core`는 Firebase 초기화를 하지 않는다. `Firestore`/`Auth` 인스턴스를 함수 인자로 받는다 — 플랫폼별 초기화 차이(웹 기본 persistence vs RN AsyncStorage persistence)를 몰라도 되게 하기 위함.
- v1 데이터 범위: `title`, `description`, `status`, `priority`, `startAt`, `dueAt`, `parentId`, `order`. 반복(`recurrence`), 아카이빙 스윕은 v1 스코프 밖 — `packages/core`는 이 필드들을 다루는 함수를 만들지 않는다.
- RN Firebase 네이티브 모듈은 쓰지 않는다. Firebase JS SDK로 통일한다(공유 함수가 두 플랫폼에서 동일하게 동작해야 하므로).
- 커밋 메시지, 코드 주석은 한국어 컨벤션(기존 커밋 로그 참고)을 따른다.

---

## 파일 구조

```
tododo/
├── packages/core/
│   ├── package.json          [Task 1] name: @tododo/core
│   ├── tsconfig.json         [Task 1]
│   └── src/
│       ├── index.ts          [Task 1] barrel export
│       ├── types/todo.ts     [Task 1] Todo, TodoFields
│       └── api/
│           ├── todoApi.ts    [Task 1] getTodos/createTodo/updateTodo/deleteTodo
│           └── __tests__/todoApi.test.ts  [Task 1]
├── mobile/
│   ├── package.json          [Task 2]
│   ├── app.json               [Task 2 생성, Task 8 수정]
│   ├── eas.json               [Task 8]
│   ├── App.tsx                 [Task 2]
│   └── src/
│       ├── firebase/index.ts  [Task 2] app/db/auth 초기화 (RN persistence)
│       ├── auth/
│       │   ├── useAuthState.ts       [Task 3]
│       │   └── googleSignIn.ts        [Task 3]
│       ├── navigation/RootNavigator.tsx  [Task 3]
│       ├── screens/
│       │   ├── LoginScreen.tsx        [Task 3]
│       │   ├── TodoListScreen.tsx     [Task 4, Task 6에서 수정]
│       │   └── TodoFormScreen.tsx     [Task 5]
│       ├── hooks/
│       │   ├── useTodos.ts            [Task 4]
│       │   ├── useCreateTodo.ts       [Task 5]
│       │   ├── useUpdateTodo.ts       [Task 5, Task 6에서 재사용]
│       │   └── useDeleteTodo.ts       [Task 5]
│       └── notifications/
│           ├── reminderTime.ts         [Task 7] 순수 함수
│           └── scheduleReminder.ts     [Task 7] Notifications API 래핑
```

---

### Task 1: packages/core — 공유 Todo 타입 + Firestore CRUD

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types/todo.ts`
- Create: `packages/core/src/api/todoApi.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/api/__tests__/todoApi.test.ts`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces: `@tododo/core`가 export하는 것 —
  - `type Todo` (`id, userId, title, description?, status, priority, startAt, dueAt, doneAt, parentId, order, createdAt, updatedAt`)
  - `type TodoFields` (생성 시 필요한 부분집합: `title, description?, priority, startAt, dueAt, parentId, order`)
  - `getTodos(db: Firestore, userId: string): Promise<Todo[]>`
  - `createTodo(db: Firestore, userId: string, fields: TodoFields): Promise<string>` (문서 id 반환)
  - `updateTodo(db: Firestore, id: string, fields: Partial<TodoFields & { status: Todo["status"]; doneAt: string | null }>): Promise<void>`
  - `deleteTodo(db: Firestore, id: string): Promise<void>`

이 4개 함수와 2개 타입이 Task 4~6에서 그대로 쓰인다.

- [x] **Step 1: packages/core 디렉터리와 package.json 작성**

```bash
mkdir -p packages/core/src/api/__tests__ packages/core/src/types
```

`packages/core/package.json`:

```json
{
  "name": "@tododo/core",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "peerDependencies": {
    "firebase": "^12.10.0"
  },
  "devDependencies": {
    "firebase": "^12.10.0",
    "typescript": "~5.8.3",
    "vitest": "^4.0.15"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [x] **Step 2: Todo 타입 작성**

`packages/core/src/types/todo.ts`:

```ts
interface Todo {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high";
  startAt: string | null;
  dueAt: string | null;
  doneAt: string | null;
  parentId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** 생성 시 클라이언트가 채우는 부분집합. status/doneAt/timestamps는 서버 쪽(todoApi)이 채운다. */
interface TodoFields {
  title: string;
  description?: string;
  priority: Todo["priority"];
  startAt: string | null;
  dueAt: string | null;
  parentId: string | null;
  order: number;
}

export type { Todo, TodoFields };
```

- [x] **Step 3: 실패하는 테스트 작성**

`packages/core/src/api/__tests__/todoApi.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { Firestore } from "firebase/firestore";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

const fakeDb = {} as Firestore;

describe("todoApi", () => {
  it("getTodos는 order 순으로 정렬해서 반환한다", async () => {
    const { getDocs } = await import("firebase/firestore");
    const { getTodos } = await import("../todoApi");

    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: "todo-2", data: () => ({ userId: "u1", title: "b", order: 1 }) },
        { id: "todo-1", data: () => ({ userId: "u1", title: "a", order: 0 }) },
      ],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    const result = await getTodos(fakeDb, "u1");

    expect(result.map((t) => t.id)).toEqual(["todo-1", "todo-2"]);
  });

  it("createTodo는 status/doneAt/timestamps를 채워서 저장하고 생성된 id를 반환한다", async () => {
    const { addDoc } = await import("firebase/firestore");
    const { createTodo } = await import("../todoApi");

    vi.mocked(addDoc).mockResolvedValueOnce({ id: "new-id" } as Awaited<
      ReturnType<typeof addDoc>
    >);

    const id = await createTodo(fakeDb, "u1", {
      title: "새 할 일",
      priority: "medium",
      startAt: null,
      dueAt: null,
      parentId: null,
      order: 0,
    });

    expect(id).toBe("new-id");
    const [, payload] = vi.mocked(addDoc).mock.calls[0];
    expect(payload).toMatchObject({
      userId: "u1",
      title: "새 할 일",
      status: "todo",
      doneAt: null,
      archived: false,
    });
  });

  it("updateTodo는 updatedAt을 갱신해서 저장한다", async () => {
    const { updateDoc } = await import("firebase/firestore");
    const { updateTodo } = await import("../todoApi");

    await updateTodo(fakeDb, "todo-1", { status: "done", doneAt: "2026-08-20T00:00:00.000Z" });

    const [, payload] = vi.mocked(updateDoc).mock.calls[0];
    expect(payload).toMatchObject({ status: "done", doneAt: "2026-08-20T00:00:00.000Z" });
    expect(payload).toHaveProperty("updatedAt");
  });

  it("deleteTodo는 해당 문서를 삭제한다", async () => {
    const { deleteDoc, doc } = await import("firebase/firestore");
    const { deleteTodo } = await import("../todoApi");

    await deleteTodo(fakeDb, "todo-1");

    expect(doc).toHaveBeenCalledWith(fakeDb, "todos", "todo-1");
    expect(deleteDoc).toHaveBeenCalled();
  });
});
```

- [x] **Step 4: 테스트 실행해서 실패 확인**

Run: `cd packages/core && npx vitest run` (아직 `todoApi.ts`, `vitest` 설정, `node_modules`가 없으므로 모듈 resolve 에러로 실패)
Expected: FAIL — `Cannot find module '../todoApi'` 또는 `vitest: command not found`

- [x] **Step 5: 의존성 설치**

```bash
cd packages/core && npm install
```

- [x] **Step 6: todoApi 구현**

`packages/core/src/api/todoApi.ts`:

```ts
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import type { Todo, TodoFields } from "../types/todo";

const normalizeOrder = (order: number | undefined): number =>
  typeof order === "number" && !Number.isNaN(order) ? order : Infinity;

const mapDocToTodo = (id: string, data: Record<string, unknown>): Todo =>
  ({ id, ...data }) as Todo;

export const getTodos = async (db: Firestore, userId: string): Promise<Todo[]> => {
  const q = query(
    collection(db, "todos"),
    where("userId", "==", userId),
    where("archived", "==", false),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => mapDocToTodo(d.id, d.data()))
    .sort((a, b) => normalizeOrder(a.order) - normalizeOrder(b.order));
};

export const createTodo = async (
  db: Firestore,
  userId: string,
  fields: TodoFields,
): Promise<string> => {
  const now = new Date().toISOString();
  const docRef = await addDoc(collection(db, "todos"), {
    ...fields,
    userId,
    status: "todo",
    doneAt: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
};

type TodoUpdateFields = Partial<TodoFields> & {
  status?: Todo["status"];
  doneAt?: string | null;
};

export const updateTodo = async (
  db: Firestore,
  id: string,
  fields: TodoUpdateFields,
): Promise<void> => {
  await updateDoc(doc(db, "todos", id), {
    ...fields,
    updatedAt: new Date().toISOString(),
  });
};

export const deleteTodo = async (db: Firestore, id: string): Promise<void> => {
  await deleteDoc(doc(db, "todos", id));
};
```

`packages/core/src/index.ts`:

```ts
export type { Todo, TodoFields } from "./types/todo";
export { getTodos, createTodo, updateTodo, deleteTodo } from "./api/todoApi";
```

- [x] **Step 7: 테스트 통과 확인**

Run: `cd packages/core && npx vitest run`
Expected: PASS (4 tests)

- [x] **Step 8: 빌드 확인 (mobile/client가 dist를 소비하므로 필수)**

Run: `cd packages/core && npm run build`
Expected: `packages/core/dist/index.js`, `packages/core/dist/index.d.ts` 생성, 에러 없음

- [x] **Step 9: 커밋**

```bash
git add packages/core
git commit -m "feat: packages/core에 웹·모바일 공유 Todo 타입/CRUD 함수 추가"
```

---

### Task 2: mobile/ Expo 앱 스캐폴딩 + Firebase 초기화

**Files:**
- Create: `mobile/` (Expo 프로젝트 전체 — `npx create-expo-app`)
- Create: `mobile/src/firebase/index.ts`
- Modify: `mobile/package.json` (`@tododo/core` 의존성 추가)
- Modify: `mobile/.env` (Firebase 설정 — `.gitignore`에 포함되어야 함)

**Interfaces:**
- Consumes: `packages/core`의 `dist/index.js` (Task 1에서 빌드됨)
- Produces:
  - `mobile/src/firebase/index.ts`의 `app`, `db`(Firestore 인스턴스), `auth`(Auth 인스턴스) — Task 3~7에서 그대로 import해서 쓴다.

- [x] **Step 1: Expo 프로젝트 생성**

```bash
cd /Users/river/tododo
npx create-expo-app@latest mobile --template blank-typescript
```

- [x] **Step 2: 의존성 설치**

```bash
cd mobile
npx expo install firebase @react-native-async-storage/async-storage
npm install @tanstack/react-query
npm install "@tododo/core@file:../packages/core"
```

`mobile/package.json`에 다음이 반영됐는지 확인:

```json
{
  "dependencies": {
    "@tododo/core": "file:../packages/core"
  }
}
```

- [x] **Step 3: Firebase 환경변수 파일 작성**

`client/.env`의 `VITE_FIREBASE_*` 7개 값을 그대로 가져와 `mobile/.env`에 Expo 규칙(`EXPO_PUBLIC_` 접두사)으로 옮긴다:

```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=...
```

`mobile/.gitignore`에 `.env`가 이미 포함되어 있는지 확인 (Expo 기본 템플릿에 포함됨).

- [x] **Step 4: Firebase 초기화 (RN persistence)**

`mobile/src/firebase/index.ts`:

```ts
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
```

- [x] **Step 5: App.tsx에서 Firebase 초기화 + QueryClientProvider 연결**

`mobile/App.tsx`:

```tsx
import "./src/firebase"; // 앱 시작 시 초기화 강제
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text, View } from "react-native";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>ToDoDo Mobile — Firebase 연결 확인용 임시 화면</Text>
      </View>
    </QueryClientProvider>
  );
}
```

- [x] **Step 6: 앱이 뜨는지 수동 확인**

Run: `cd mobile && npx expo start`

iOS 시뮬레이터 또는 Expo Go 앱으로 접속해 "Firebase 연결 확인용 임시 화면" 텍스트가 뜨고, 콘솔에 Firebase 초기화 에러(`auth/invalid-api-key` 등)가 없는지 확인한다. 이 태스크는 UI 로직이 없어 자동화 테스트 대신 이 수동 부팅 확인이 완료 기준이다.

> 실기기 Expo Go는 SDK 57 스토어 롤아웃 지연("requires a newer version of Expo Go")으로 접속 불가해, `npx expo start --web`으로 대체 확인함. 이 과정에서 `firebase/auth`의 웹 번들에 `getReactNativePersistence`가 없어 `TypeError`가 발생하는 것을 발견 — `mobile/src/firebase/index.ts`를 `index.native.ts`(RN persistence, 기존 코드)와 `index.web.ts`(`getAuth`, 웹 전용 신규)로 분리해 해결. 웹에서 에러 없이 렌더링되는 것을 확인함.

- [x] **Step 7: 커밋**

```bash
git add mobile
git commit -m "feat: mobile/ Expo 앱 스캐폴딩 및 Firebase 초기화"
```

---

### Task 3: 인증 (Google 로그인 + 인증 상태별 네비게이션 분기)

**Files:**
- Create: `mobile/src/auth/googleSignIn.ts`
- Create: `mobile/src/auth/useAuthState.ts`
- Create: `mobile/src/screens/LoginScreen.tsx`
- Create: `mobile/src/navigation/RootNavigator.tsx`
- Modify: `mobile/App.tsx` (임시 화면을 `RootNavigator`로 교체)
- Test: `mobile/src/auth/__tests__/useAuthState.test.tsx`

**Interfaces:**
- Consumes: `mobile/src/firebase`의 `auth` (Task 2)
- Produces:
  - `useAuthState(): { user: User | null; loading: boolean }` — Task 4 이후 화면들이 `user.uid`로 CRUD 함수를 호출할 때 쓴다.
  - `RootNavigator` — 이후 화면(`TodoListScreen` 등)이 이 네비게이터의 스택에 등록된다.

- [x] **Step 1: 의존성 설치**

```bash
cd mobile
npx expo install @react-native-google-signin/google-signin
npm install @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
```

> 브리프의 Step 3/5가 `npx jest`로 테스트를 실행하도록 명시했지만 `mobile/`에 Jest가 아직 구성되어 있지 않았음 — `jest-expo`, `babel-preset-expo`, `@testing-library/react-native`를 함께 설치하고 `mobile/babel.config.js`, `mobile/jest.config.js`, `package.json`의 `test` 스크립트를 새로 구성함.

- [x] **Step 2: 실패하는 테스트 작성**

`mobile/src/auth/__tests__/useAuthState.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react-native";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../firebase", () => ({ auth: {} }));

const authStateCallbacks: Array<(user: unknown) => void> = [];
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    authStateCallbacks.push(cb);
    return () => {};
  },
}));

describe("useAuthState", () => {
  it("초기값은 loading true, user null이다", async () => {
    const { useAuthState } = await import("../useAuthState");
    const { result } = renderHook(() => useAuthState());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it("onAuthStateChanged 콜백이 오면 loading false, user가 채워진다", async () => {
    const { useAuthState } = await import("../useAuthState");
    const { result } = renderHook(() => useAuthState());

    authStateCallbacks[authStateCallbacks.length - 1]({ uid: "u1" });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual({ uid: "u1" });
  });
});
```

- [x] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd mobile && npx jest src/auth/__tests__/useAuthState.test.tsx`
Expected: FAIL — `Cannot find module '../useAuthState'`

- [x] **Step 4: useAuthState 구현**

`mobile/src/auth/useAuthState.ts`:

```ts
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../firebase";

export const useAuthState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  return { user, loading };
};
```

- [x] **Step 5: 테스트 통과 확인**

Run: `cd mobile && npx jest src/auth/__tests__/useAuthState.test.tsx`
Expected: PASS (2 tests)

- [x] **Step 6: Google 로그인 함수 작성**

`mobile/src/auth/googleSignIn.ts`:

```ts
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "../firebase";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID,
});

export const signInWithGoogle = async () => {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  const idToken = response.data?.idToken;
  if (!idToken) throw new Error("Google 로그인 토큰을 받지 못했습니다");
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
};
```

`EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID`는 Firebase 콘솔 > 프로젝트 설정 > 일반 > 웹 SDK 구성의 클라이언트 ID다. `mobile/.env`에 추가한다.

- [x] **Step 7: 로그인 화면 작성**

`mobile/src/screens/LoginScreen.tsx`:

```tsx
import { Button, View, Text } from "react-native";
import { useState } from "react";
import { signInWithGoogle } from "../auth/googleSignIn";

export const LoginScreen = () => {
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setError(null);
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다");
    }
  };

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Button title="Google로 로그인" onPress={handleLogin} />
      {error && <Text style={{ color: "red" }}>{error}</Text>}
    </View>
  );
};
```

- [x] **Step 8: 인증 상태별 네비게이션 분기**

`mobile/src/navigation/RootNavigator.tsx`:

```tsx
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useAuthState } from "../auth/useAuthState";
import { LoginScreen } from "../screens/LoginScreen";
import { TodoListScreen } from "../screens/TodoListScreen";

const Stack = createNativeStackNavigator();

export const RootNavigator = () => {
  const { user, loading } = useAuthState();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user ? (
          <Stack.Screen name="TodoList" component={TodoListScreen} options={{ title: "할 일" }} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
```

`RootNavigator`는 `TodoListScreen`을 import한다 — 이 파일은 Task 4에서 만들어지므로, Task 3만 단독 실행 시 최소 스텁(`export const TodoListScreen = () => null;`)을 `mobile/src/screens/TodoListScreen.tsx`에 임시로 만들어 둔다. Task 4에서 실제 구현으로 교체한다.

- [x] **Step 9: App.tsx를 RootNavigator로 교체**

`mobile/App.tsx`:

```tsx
import "./src/firebase";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RootNavigator } from "./src/navigation/RootNavigator";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 10: 수동 확인** — 미완료, 아래 참고

Run: `cd mobile && npx expo start`

로그인 화면이 뜨고, Google 로그인 버튼을 누르면 네이티브 Google 계정 선택 UI가 뜨는지 확인한다(실제 로그인 성공 후 빈 `TodoListScreen`으로 전환되면 정상).

> 이 세션 환경에는 실기기/시뮬레이터가 없어 실행하지 못함. 대신 코드 리뷰 과정에서 **Task 2의 `mobile/src/firebase/index.native.ts`에 실행 시점 크래시를 유발하는 버그**를 발견함: `getReactNativePersistence`를 `"firebase/auth"`에서 import하지만, 설치된 `firebase@12.18.0`의 `exports["./auth"]` 맵에는 `"react-native"` 조건이 없어 이 함수가 실제로는 export되지 않는다(`firebase/auth/dist/esm/index.esm.js`, `dist/index.cjs.js` 모두 확인 — 0건). `App.tsx`가 `import "./src/firebase"`를 최상단에서 실행하므로, 이 Step 10을 지금 시도하면 앱 부팅 시 `TypeError: getReactNativePersistence is not a function`로 크래시할 가능성이 높다. Task 3의 파일 목록 밖(Task 2 소유 파일)이라 이 태스크에서 고치지 않고 별도 후속 작업으로 남김 — Task 4 이후 수동 검증 전에 먼저 해결 필요.

- [x] **Step 11: 커밋**

```bash
git add mobile
git commit -m "feat: mobile Google 로그인 및 인증 상태별 네비게이션 분기"
```

---

### Task 4: 할 일 목록 화면 (조회)

**Files:**
- Create: `mobile/src/hooks/useTodos.ts`
- Modify: `mobile/src/screens/TodoListScreen.tsx` (Task 3의 스텁을 실제 구현으로 교체)
- Test: `mobile/src/hooks/__tests__/useTodos.test.tsx`
- Test: `mobile/src/screens/__tests__/TodoListScreen.test.tsx`

**Interfaces:**
- Consumes: `@tododo/core`의 `getTodos`, `Todo` 타입 (Task 1) / `mobile/src/firebase`의 `db` (Task 2) / `useAuthState` (Task 3)
- Produces: `useTodos()` 훅 — Task 5, 6에서 목록 무효화(`invalidateQueries(["todos"])`) 대상 쿼리 키로 재사용한다. 쿼리 키는 `["todos", userId]`.

- [ ] **Step 1: 실패하는 훅 테스트 작성**

`mobile/src/hooks/__tests__/useTodos.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
vi.mock("@tododo/core", () => ({
  getTodos: vi.fn().mockResolvedValue([{ id: "todo-1", title: "테스트" }]),
}));

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("useTodos", () => {
  it("로그인 사용자의 할 일 목록을 반환한다", async () => {
    const { useTodos } = await import("../useTodos");
    const { result } = renderHook(() => useTodos(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "todo-1", title: "테스트" }]);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd mobile && npx jest src/hooks/__tests__/useTodos.test.tsx`
Expected: FAIL — `Cannot find module '../useTodos'`

- [ ] **Step 3: useTodos 구현**

`mobile/src/hooks/useTodos.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { getTodos } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

export const useTodos = () => {
  const { user } = useAuthState();

  return useQuery({
    queryKey: ["todos", user?.uid],
    queryFn: () => getTodos(db, user!.uid),
    enabled: !!user,
  });
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest src/hooks/__tests__/useTodos.test.tsx`
Expected: PASS

- [ ] **Step 5: 화면 테스트 작성**

`mobile/src/screens/__tests__/TodoListScreen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../hooks/useTodos", () => ({
  useTodos: () => ({
    isLoading: false,
    data: [
      { id: "todo-1", title: "루트 할 일", parentId: null, status: "todo" },
      { id: "todo-2", title: "하위 할 일", parentId: "todo-1", status: "todo" },
    ],
  }),
}));

describe("TodoListScreen", () => {
  it("루트와 하위 할 일 제목을 모두 렌더링한다", async () => {
    const { TodoListScreen } = await import("../TodoListScreen");
    render(<TodoListScreen />);

    expect(screen.getByText("루트 할 일")).toBeTruthy();
    expect(screen.getByText("하위 할 일")).toBeTruthy();
  });
});
```

- [ ] **Step 6: TodoListScreen 구현 (Task 3의 스텁 교체)**

`mobile/src/screens/TodoListScreen.tsx`:

```tsx
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import type { Todo } from "@tododo/core";
import { useTodos } from "../hooks/useTodos";

const TodoRow = ({ todo }: { todo: Todo }) => (
  <View style={{ paddingVertical: 8, paddingLeft: todo.parentId ? 32 : 16 }}>
    <Text>{todo.title}</Text>
  </View>
);

export const TodoListScreen = () => {
  const { data: todos, isLoading } = useTodos();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={todos ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TodoRow todo={item} />}
    />
  );
};
```

- [ ] **Step 7: 화면 테스트 통과 확인**

Run: `cd mobile && npx jest src/screens/__tests__/TodoListScreen.test.tsx`
Expected: PASS

- [ ] **Step 8: 수동 확인**

Run: `cd mobile && npx expo start` — 로그인 후 실제 Firestore에 저장된 할 일 목록이 뜨는지 확인.

- [ ] **Step 9: 커밋**

```bash
git add mobile
git commit -m "feat: mobile 할 일 목록 화면 (조회)"
```

---

### Task 5: 할 일 CRUD (생성·수정·삭제)

**Files:**
- Create: `mobile/src/hooks/useCreateTodo.ts`
- Create: `mobile/src/hooks/useUpdateTodo.ts`
- Create: `mobile/src/hooks/useDeleteTodo.ts`
- Create: `mobile/src/screens/TodoFormScreen.tsx`
- Modify: `mobile/src/screens/TodoListScreen.tsx` (삭제 버튼, 생성 화면 이동 버튼 추가)
- Modify: `mobile/src/navigation/RootNavigator.tsx` (`TodoForm` 라우트 추가)
- Test: `mobile/src/hooks/__tests__/useCreateTodo.test.tsx` (생성만 대표로 작성, 수정·삭제는 Step에서 같은 패턴 반복)

**Interfaces:**
- Consumes: `@tododo/core`의 `createTodo`/`updateTodo`/`deleteTodo` (Task 1), `useTodos`의 쿼리 키 `["todos", userId]` (Task 4)
- Produces: `useUpdateTodo()` — Task 6(상태·priority 변경)이 그대로 재사용.

- [ ] **Step 1: 실패하는 useCreateTodo 테스트 작성**

`mobile/src/hooks/__tests__/useCreateTodo.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
vi.mock("@tododo/core", () => ({
  createTodo: vi.fn().mockResolvedValue("new-id"),
}));

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("useCreateTodo", () => {
  it("생성 성공 시 todos 쿼리를 무효화한다", async () => {
    const { createTodo } = await import("@tododo/core");
    const { useCreateTodo } = await import("../useCreateTodo");
    const { result } = renderHook(() => useCreateTodo(), { wrapper });

    result.current.mutate({
      title: "새 할 일",
      priority: "medium",
      startAt: null,
      dueAt: null,
      parentId: null,
      order: 0,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createTodo).toHaveBeenCalledWith({}, "u1", expect.objectContaining({ title: "새 할 일" }));
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd mobile && npx jest src/hooks/__tests__/useCreateTodo.test.tsx`
Expected: FAIL — `Cannot find module '../useCreateTodo'`

- [ ] **Step 3: useCreateTodo/useUpdateTodo/useDeleteTodo 구현**

`mobile/src/hooks/useCreateTodo.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTodo, type TodoFields } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

export const useCreateTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fields: TodoFields) => createTodo(db, user!.uid, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};
```

`mobile/src/hooks/useUpdateTodo.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodo, type Todo, type TodoFields } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

type UpdatePayload = {
  id: string;
  fields: Partial<TodoFields> & { status?: Todo["status"]; doneAt?: string | null };
};

export const useUpdateTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, fields }: UpdatePayload) => updateTodo(db, id, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};
```

`mobile/src/hooks/useDeleteTodo.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTodo } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

export const useDeleteTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTodo(db, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest src/hooks/__tests__/useCreateTodo.test.tsx`
Expected: PASS

- [ ] **Step 5: 생성/수정 폼 화면 작성**

`mobile/src/screens/TodoFormScreen.tsx`:

```tsx
import { useState } from "react";
import { Button, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useCreateTodo } from "../hooks/useCreateTodo";

export const TodoFormScreen = () => {
  const [title, setTitle] = useState("");
  const navigation = useNavigation();
  const { mutate, isPending } = useCreateTodo();

  const handleSubmit = () => {
    if (!title.trim()) return;
    mutate(
      { title, priority: "medium", startAt: null, dueAt: null, parentId: null, order: 0 },
      { onSuccess: () => navigation.goBack() },
    );
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="할 일 제목"
        style={{ borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 4 }}
      />
      <Button title="추가" onPress={handleSubmit} disabled={isPending} />
    </View>
  );
};
```

- [ ] **Step 6: 목록 화면에 생성 이동 버튼 + 삭제 추가**

`mobile/src/screens/TodoListScreen.tsx`에서 `TodoRow`를 다음으로 교체하고, 헤더에 생성 버튼을 단다:

```tsx
import { ActivityIndicator, Button, FlatList, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { Todo } from "@tododo/core";
import { useTodos } from "../hooks/useTodos";
import { useDeleteTodo } from "../hooks/useDeleteTodo";

const TodoRow = ({ todo }: { todo: Todo }) => {
  const { mutate: deleteTodo } = useDeleteTodo();

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
        paddingLeft: todo.parentId ? 32 : 16,
      }}
    >
      <Text>{todo.title}</Text>
      <Button title="삭제" onPress={() => deleteTodo(todo.id)} />
    </View>
  );
};

export const TodoListScreen = () => {
  const { data: todos, isLoading } = useTodos();
  const navigation = useNavigation();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Button title="할 일 추가" onPress={() => navigation.navigate("TodoForm" as never)} />
      <FlatList
        data={todos ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TodoRow todo={item} />}
      />
    </View>
  );
};
```

- [ ] **Step 7: RootNavigator에 TodoForm 라우트 추가**

`mobile/src/navigation/RootNavigator.tsx`의 `<Stack.Screen name="TodoList" ... />` 다음 줄에 추가:

```tsx
<Stack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
```

(파일 상단 import에 `import { TodoFormScreen } from "../screens/TodoFormScreen";` 추가. 이 라우트는 `user`가 있을 때의 스택 안, 즉 `{user ? (...) : (...)}` 중 `user` 분기 안에 `TodoList` Screen과 함께 넣는다.)

- [ ] **Step 8: 기존 테스트 전체 통과 확인**

Run: `cd mobile && npx jest`
Expected: PASS (모든 테스트)

- [ ] **Step 9: 수동 확인**

Run: `cd mobile && npx expo start` — 할 일 추가 → 목록에 반영 → 삭제 → 목록에서 사라짐을 확인.

- [ ] **Step 10: 커밋**

```bash
git add mobile
git commit -m "feat: mobile 할 일 생성·삭제 (CRUD 기본)"
```

---

### Task 6: 상태 변경 + priority UI

**Files:**
- Modify: `mobile/src/screens/TodoListScreen.tsx` (상태 토글, priority 표시 추가)
- Test: `mobile/src/screens/__tests__/TodoListScreen.test.tsx` (Task 4 테스트에 케이스 추가)

**Interfaces:**
- Consumes: `useUpdateTodo` (Task 5)
- Produces: 없음 (터미널 화면 — 이후 태스크가 이 화면을 확장하지 않음)

- [ ] **Step 1: 실패하는 테스트 케이스 추가**

`mobile/src/screens/__tests__/TodoListScreen.test.tsx`에 다음 테스트를 추가:

```tsx
it("상태 버튼을 누르면 useUpdateTodo가 다음 상태로 호출된다", async () => {
  const updateMock = vi.fn();
  vi.doMock("../../hooks/useUpdateTodo", () => ({
    useUpdateTodo: () => ({ mutate: updateMock }),
  }));

  const { TodoListScreen } = await import("../TodoListScreen");
  render(<TodoListScreen />);

  fireEvent.press(screen.getByTestId("status-toggle-todo-1"));

  expect(updateMock).toHaveBeenCalledWith({
    id: "todo-1",
    fields: { status: "doing" },
  });
});
```

(`fireEvent`, `screen`은 `@testing-library/react-native`에서 함께 import한다.)

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd mobile && npx jest src/screens/__tests__/TodoListScreen.test.tsx`
Expected: FAIL — `testID="status-toggle-todo-1"`을 찾을 수 없음

- [ ] **Step 3: 상태 순환 로직 + priority 표시 구현**

`mobile/src/screens/TodoListScreen.tsx`의 `TodoRow`를 다음으로 교체:

```tsx
import { ActivityIndicator, Button, FlatList, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { Todo } from "@tododo/core";
import { useTodos } from "../hooks/useTodos";
import { useDeleteTodo } from "../hooks/useDeleteTodo";
import { useUpdateTodo } from "../hooks/useUpdateTodo";

const nextStatus: Record<Todo["status"], Todo["status"]> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

const priorityLabel: Record<Todo["priority"], string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

const TodoRow = ({ todo }: { todo: Todo }) => {
  const { mutate: deleteTodo } = useDeleteTodo();
  const { mutate: updateTodo } = useUpdateTodo();

  const handleToggleStatus = () => {
    updateTodo({ id: todo.id, fields: { status: nextStatus[todo.status] } });
  };

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
        paddingLeft: todo.parentId ? 32 : 16,
      }}
    >
      <Pressable testID={`status-toggle-${todo.id}`} onPress={handleToggleStatus}>
        <Text>[{todo.status}]</Text>
      </Pressable>
      <Text style={{ flex: 1, marginLeft: 8 }}>{todo.title}</Text>
      <Text>{priorityLabel[todo.priority]}</Text>
      <Button title="삭제" onPress={() => deleteTodo(todo.id)} />
    </View>
  );
};

export const TodoListScreen = () => {
  const { data: todos, isLoading } = useTodos();
  const navigation = useNavigation();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Button title="할 일 추가" onPress={() => navigation.navigate("TodoForm" as never)} />
      <FlatList
        data={todos ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TodoRow todo={item} />}
      />
    </View>
  );
};
```

기존 테스트(Task 4)의 mock 데이터에 `status`, `priority` 필드가 없으면 이 시점에 타입 에러가 나므로, `useTodos` mock 데이터에 `status: "todo", priority: "medium"`을 추가해 둔다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest src/screens/__tests__/TodoListScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: 수동 확인**

Run: `cd mobile && npx expo start` — 상태 텍스트를 눌러 todo→doing→done→todo로 순환하는지, Firestore 문서의 `status`가 실제로 바뀌는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add mobile
git commit -m "feat: mobile 할 일 상태 순환 토글 및 priority 표시"
```

---

### Task 7: dueAt 기반 로컬 알림

**Files:**
- Create: `mobile/src/notifications/reminderTime.ts`
- Create: `mobile/src/notifications/scheduleReminder.ts`
- Modify: `mobile/src/hooks/useCreateTodo.ts`, `mobile/src/hooks/useUpdateTodo.ts`, `mobile/src/hooks/useDeleteTodo.ts` (알림 예약/취소 연결)
- Test: `mobile/src/notifications/__tests__/reminderTime.test.ts`
- Test: `mobile/src/notifications/__tests__/scheduleReminder.test.ts`

**Interfaces:**
- Consumes: `Todo` 타입 (Task 1), `useCreateTodo`/`useUpdateTodo`/`useDeleteTodo`의 `onSuccess` 훅 포인트 (Task 5)
- Produces: 없음 (터미널 태스크)

- [ ] **Step 1: 순수 함수(트리거 시각 계산)부터 실패하는 테스트 작성**

`mobile/src/notifications/__tests__/reminderTime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getReminderTrigger } from "../reminderTime";

describe("getReminderTrigger", () => {
  it("dueAt이 미래면 그 시각을 반환한다", () => {
    const dueAt = "2026-12-31T09:00:00.000Z";
    const now = new Date("2026-08-20T00:00:00.000Z");

    expect(getReminderTrigger(dueAt, now)).toEqual(new Date(dueAt));
  });

  it("dueAt이 null이면 null을 반환한다 (예약 안 함)", () => {
    expect(getReminderTrigger(null, new Date())).toBeNull();
  });

  it("dueAt이 이미 지났으면 null을 반환한다 (과거 알림 예약 방지)", () => {
    const dueAt = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-08-20T00:00:00.000Z");

    expect(getReminderTrigger(dueAt, now)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd mobile && npx jest src/notifications/__tests__/reminderTime.test.ts`
Expected: FAIL — `Cannot find module '../reminderTime'`

- [ ] **Step 3: reminderTime 구현**

`mobile/src/notifications/reminderTime.ts`:

```ts
export const getReminderTrigger = (dueAt: string | null, now: Date): Date | null => {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (due.getTime() <= now.getTime()) return null;
  return due;
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd mobile && npx jest src/notifications/__tests__/reminderTime.test.ts`
Expected: PASS

- [ ] **Step 5: scheduleReminder 실패하는 테스트 작성**

`mobile/src/notifications/__tests__/scheduleReminder.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("expo-notifications", () => ({
  scheduleNotificationAsync: vi.fn().mockResolvedValue("notif-id"),
  cancelScheduledNotificationAsync: vi.fn().mockResolvedValue(undefined),
}));

describe("scheduleReminder", () => {
  it("dueAt이 미래인 할 일에 알림을 예약하고 id를 반환한다", async () => {
    const { scheduleNotificationAsync } = await import("expo-notifications");
    const { scheduleReminder } = await import("../scheduleReminder");

    const id = await scheduleReminder({
      id: "todo-1",
      title: "장보기",
      dueAt: "2099-01-01T09:00:00.000Z",
    });

    expect(id).toBe("notif-id");
    expect(scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ title: "장보기" }),
      }),
    );
  });

  it("dueAt이 없으면 예약하지 않고 null을 반환한다", async () => {
    const { scheduleReminder } = await import("../scheduleReminder");

    const id = await scheduleReminder({ id: "todo-1", title: "장보기", dueAt: null });

    expect(id).toBeNull();
  });

  it("cancelReminder는 저장된 알림 id를 취소한다", async () => {
    const { cancelScheduledNotificationAsync } = await import("expo-notifications");
    const { cancelReminder } = await import("../scheduleReminder");

    await cancelReminder("notif-id");

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-id");
  });
});
```

- [ ] **Step 6: 테스트 실행해서 실패 확인**

Run: `cd mobile && npx jest src/notifications/__tests__/scheduleReminder.test.ts`
Expected: FAIL — `Cannot find module '../scheduleReminder'`

- [ ] **Step 7: expo-notifications 설치 및 scheduleReminder 구현**

```bash
cd mobile && npx expo install expo-notifications
```

`mobile/src/notifications/scheduleReminder.ts`:

```ts
import * as Notifications from "expo-notifications";
import { getReminderTrigger } from "./reminderTime";

type ReminderTodo = { id: string; title: string; dueAt: string | null };

export const scheduleReminder = async (todo: ReminderTodo): Promise<string | null> => {
  const trigger = getReminderTrigger(todo.dueAt, new Date());
  if (!trigger) return null;

  return Notifications.scheduleNotificationAsync({
    content: { title: todo.title, body: "마감 시간입니다" },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
};

export const cancelReminder = (notificationId: string): Promise<void> =>
  Notifications.cancelScheduledNotificationAsync(notificationId);
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd mobile && npx jest src/notifications/__tests__/scheduleReminder.test.ts`
Expected: PASS

- [ ] **Step 9: 생성·수정·삭제 훅에 연결**

`mobile/src/hooks/useCreateTodo.ts`의 `onSuccess`를 다음으로 교체 (mutationFn이 반환하는 id로 알림을 예약해야 하므로 `mutationFn`도 함께 조정):

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTodo, type TodoFields } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";
import { scheduleReminder } from "../notifications/scheduleReminder";

export const useCreateTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fields: TodoFields) => {
      const id = await createTodo(db, user!.uid, fields);
      await scheduleReminder({ id, title: fields.title, dueAt: fields.dueAt });
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};
```

`mobile/src/hooks/useUpdateTodo.ts` — `fields.status === "done"`이거나 `dueAt`이 바뀌면 재예약하도록 `mutationFn`에 반영:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodo, type Todo, type TodoFields } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";
import { scheduleReminder } from "../notifications/scheduleReminder";

type UpdatePayload = {
  id: string;
  fields: Partial<TodoFields> & { status?: Todo["status"]; doneAt?: string | null };
  title?: string;
};

export const useUpdateTodo = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, fields, title }: UpdatePayload) => {
      await updateTodo(db, id, fields);
      if (fields.status === "done") return;
      if (fields.dueAt !== undefined && title) {
        await scheduleReminder({ id, title, dueAt: fields.dueAt });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", user?.uid] });
    },
  });
};
```

이 변경으로 Task 6에서 호출하던 `updateTodo({ id: todo.id, fields: { status: nextStatus[todo.status] } })` 호출부(`TodoListScreen.tsx`)는 그대로 동작한다 — `title`을 안 넘기면 재예약을 건너뛸 뿐 기존 호출은 깨지지 않는다.

`mobile/src/hooks/useDeleteTodo.ts` — 삭제 시 알림 취소는 알림 id를 별도로 들고 있어야 해서 v1 범위를 넘어간다(로컬 알림 id ↔ todo id 매핑 저장소가 필요). 이번 태스크는 **생성/수정 시 예약**까지만 다루고, 삭제 시 알림 취소는 "범위 밖(기록)"에 남긴다 — 사용자가 알림을 받아도 앱을 열면 이미 삭제된 할 일이라는 것을 알 수 있어 v1 허용 범위로 판단.

- [ ] **Step 10: 기존 테스트 전체 통과 확인**

Run: `cd mobile && npx jest`
Expected: PASS (모든 테스트 — Task 5의 `useCreateTodo.test.tsx`가 `scheduleReminder`를 모킹하지 않아 깨진다면, 해당 테스트 파일 상단에 `vi.mock("../../notifications/scheduleReminder", () => ({ scheduleReminder: vi.fn().mockResolvedValue(null) }));`를 추가한다.)

- [ ] **Step 11: 수동 확인**

Run: `cd mobile && npx expo start` — dueAt을 몇 분 뒤로 설정해 할 일을 만들고, 실제로 로컬 알림이 오는지 실기기(또는 시뮬레이터, iOS 시뮬레이터는 알림 지원 제한적이므로 실기기 권장)로 확인.

- [ ] **Step 12: 커밋**

```bash
git add mobile
git commit -m "feat: mobile dueAt 기반 로컬 알림 예약"
```

---

### Task 8: 스토어 배포 준비 (EAS)

**Files:**
- Modify: `mobile/app.json` (번들 ID, 아이콘, 스플래시)
- Create: `mobile/eas.json`
- Create: `mobile/assets/icon.png`, `mobile/assets/splash.png` (디자인 리소스 — 이 태스크에서는 임시 플레이스홀더로 진행하고 실제 디자인은 별도 트랙)

**Interfaces:**
- Consumes: 없음 (이전 태스크의 런타임 코드에 의존하지 않음)
- Produces: 없음 (배포 산출물)

이 태스크는 Apple Developer Program / Google Play Console 계정이 실제로 있어야 마지막 제출 단계까지 완료할 수 있다. 계정 준비는 이 세션에서 사용자가 직접 처리해야 하는 부분이라 미리 확인이 필요하다 — Apple Developer 연 $99, Google Play 최초 $25.

- [ ] **Step 1: EAS CLI 설치 및 로그인**

```bash
npm install -g eas-cli
eas login
```

- [ ] **Step 2: EAS 프로젝트 설정**

```bash
cd mobile && eas build:configure
```

이 명령이 `mobile/eas.json`을 생성한다. 기본 생성 내용을 다음으로 다듬는다:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 3: app.json에 번들 ID/버전 설정**

`mobile/app.json`의 `expo` 필드에 추가:

```json
{
  "expo": {
    "name": "ToDoDo",
    "slug": "tododo",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.tododo.app",
      "supportsTablet": false
    },
    "android": {
      "package": "com.tododo.app"
    }
  }
}
```

번들 ID(`com.tododo.app`)는 최종 확정 전 사용자 확인이 필요한 값이다 — 다른 조직에서 이미 선점했는지는 각 스토어 콘솔에서 실제 등록 시점에 확인된다.

- [ ] **Step 4: 아이콘/스플래시 플레이스홀더 추가**

`mobile/assets/icon.png`(1024x1024), `mobile/assets/splash.png`를 Expo 기본 템플릿 산출물(`npx create-expo-app`이 이미 만들어 둔 `assets/icon.png` 등)로 유지하거나, 브랜드 컬러(`brand.strong` `#0F6E56`) 기반 단색 아이콘으로 임시 교체한다. 실제 디자인 확정은 이 플랜의 범위 밖 — `designer` 에이전트와 별도로 진행한다.

- [ ] **Step 5: 개발 빌드로 실기기 설치 확인**

```bash
cd mobile && eas build --profile development --platform ios
```

(Android도 동일하게 `--platform android`) 빌드가 성공하고 실기기에 설치되어 Task 2~7에서 만든 기능이 실기기에서도 동작하는지 확인한다.

- [ ] **Step 6: 프로덕션 빌드 및 제출 (계정 준비된 경우)**

```bash
cd mobile && eas build --profile production --platform all
eas submit --platform ios
eas submit --platform android
```

Apple Developer Program 미가입 상태라면 이 스텝은 계정 가입 후로 미룬다 — Step 5까지 완료하면 "스토어 제출 직전" 상태로 이 태스크를 마감할 수 있다.

- [ ] **Step 7: 커밋**

```bash
git add mobile/app.json mobile/eas.json
git commit -m "feat: mobile EAS 빌드/배포 설정"
```

---

## 범위 밖 (기록)

- 삭제 시 로컬 알림 취소 (Task 7 참고 — 알림 id ↔ todo id 매핑 저장소 필요)
- `client/`의 기존 `todoApi.ts`를 `packages/core`로 마이그레이션 — 이번 계획은 `packages/core`를 신규 작성만 하고 `client/`는 건드리지 않는다. 웹과 모바일 로직이 당분간 별개로 유지되며, 두 코드베이스가 갈라지지 않도록 후속 계획에서 다뤄야 한다.
- 칸반 보드, 캘린더 대시보드의 RN 포팅
- 서버발 푸시 알림, 오프라인 동기화
- RN E2E(Detox/Maestro)

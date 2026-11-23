import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Sun, ListTodo, CalendarDays, ChartColumn } from "lucide-react-native";
import { useAuthState } from "../auth/useAuthState";
import { LoginScreen } from "../screens/LoginScreen";
import { TodayScreen } from "../screens/TodayScreen";
import { TodoListScreen } from "../screens/TodoListScreen";
import { TodoFormScreen } from "../screens/TodoFormScreen";
import { TodoDetailScreen } from "../screens/TodoDetailScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { InsightsScreen } from "../screens/InsightsScreen";
import { AccountScreen } from "../screens/AccountScreen";
import { AiPlanScreen } from "../screens/AiPlanScreen";
import { HeaderActions } from "./HeaderActions";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import type { TodayStackParamList, TodoListStackParamList, CalendarStackParamList, InsightsStackParamList } from "./types";
import { colors } from "../theme/colors";
import { useEntitlementSync } from "../premium";
import { useStartupMaintenance } from "../maintenance/useStartupMaintenance";
import { resumePendingPurchases } from "../premium/iap/resumePending";
import { useSyncTodosToCalendar } from "../calendarIntegration/useSyncTodosToCalendar";
import { hideSplash } from "../shared/lib/splash";
import { reportError } from "../shared/lib/sentry";
import {
  ReminderBannerProvider,
  ReminderPromptProvider,
  cancelLegacyLocalRemindersOnce,
  useForegroundReminders,
  useNotificationNavigation,
  usePushTokenSync,
  useRefreshHistoryOnForeground,
  useReminderRefresh,
} from "../reminders";
import { flushPendingTodoDetail, navigationRef } from "./navigationRef";

const TodayStack = createNativeStackNavigator<TodayStackParamList>();
const TodoListStack = createNativeStackNavigator<TodoListStackParamList>();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();
const InsightsStack = createNativeStackNavigator<InsightsStackParamList>();
const Tab = createBottomTabNavigator();

// 네 스택 모두 Account·Notifications 라우트를 가지므로 어느 탭에서든 헤더 아이콘으로 두 화면에 간다.
// 각 화면 자신은 options에서 자기 아이콘을 지운다. navigation 타입을 스택별 ParamList가
// 아니라 navigate만 요구하는 모양으로 좁혀야 네 스택에 같은 함수를 넘길 수 있다.
type HeaderNavigation = { navigate: (name: "Notifications" | "Account") => void };

const accountHeaderOptions = ({ navigation }: { navigation: HeaderNavigation }): NativeStackNavigationOptions => ({
  headerRight: () => <HeaderActions navigate={navigation.navigate} />,
});

const accountScreenOptions: NativeStackNavigationOptions = { title: "계정", headerRight: undefined };

// 알림 화면에서는 벨만 숨기고 계정 아이콘은 그대로 둔다.
const notificationsScreenOptions = ({ navigation }: { navigation: HeaderNavigation }): NativeStackNavigationOptions => ({
  title: "알림",
  headerRight: () => <HeaderActions navigate={navigation.navigate} showBell={false} />,
});

const TodayTabStack = () => (
  <TodayStack.Navigator screenOptions={accountHeaderOptions}>
    <TodayStack.Screen name="Today" component={TodayScreen} options={{ title: "오늘" }} />
    <TodayStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <TodayStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
    <TodayStack.Screen name="Account" component={AccountScreen} options={accountScreenOptions} />
    <TodayStack.Screen name="Notifications" component={NotificationsScreen} options={notificationsScreenOptions} />
  </TodayStack.Navigator>
);

const TodoListTabStack = () => (
  <TodoListStack.Navigator screenOptions={accountHeaderOptions}>
    <TodoListStack.Screen name="TodoList" component={TodoListScreen} options={{ title: "할 일" }} />
    <TodoListStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <TodoListStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
    <TodoListStack.Screen name="AiPlan" component={AiPlanScreen} options={{ title: "AI로 계획" }} />
    <TodoListStack.Screen name="Account" component={AccountScreen} options={accountScreenOptions} />
    <TodoListStack.Screen name="Notifications" component={NotificationsScreen} options={notificationsScreenOptions} />
  </TodoListStack.Navigator>
);

const CalendarTabStack = () => (
  <CalendarStack.Navigator screenOptions={accountHeaderOptions}>
    <CalendarStack.Screen name="Calendar" component={CalendarScreen} options={{ title: "캘린더" }} />
    <CalendarStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <CalendarStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
    <CalendarStack.Screen name="Account" component={AccountScreen} options={accountScreenOptions} />
    <CalendarStack.Screen name="Notifications" component={NotificationsScreen} options={notificationsScreenOptions} />
  </CalendarStack.Navigator>
);

const InsightsTabStack = () => (
  <InsightsStack.Navigator screenOptions={accountHeaderOptions}>
    <InsightsStack.Screen name="Insights" component={InsightsScreen} options={{ title: "통계" }} />
    <InsightsStack.Screen name="Account" component={AccountScreen} options={accountScreenOptions} />
    <InsightsStack.Screen name="Notifications" component={NotificationsScreen} options={notificationsScreenOptions} />
  </InsightsStack.Navigator>
);

const MainTabs = () => {
  return (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brand.strong,
      tabBarInactiveTintColor: colors.text.tertiary,
    }}
  >
    <Tab.Screen
      name="오늘"
      component={TodayTabStack}
      options={{ tabBarIcon: ({ color, size }) => <Sun color={color} size={size} /> }}
    />
    <Tab.Screen
      name="목록"
      component={TodoListTabStack}
      options={{ tabBarIcon: ({ color, size }) => <ListTodo color={color} size={size} /> }}
    />
    <Tab.Screen
      name="캘린더"
      component={CalendarTabStack}
      options={{ tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }}
    />
    <Tab.Screen
      name="통계"
      component={InsightsTabStack}
      options={{ tabBarIcon: ({ color, size }) => <ChartColumn color={color} size={size} /> }}
    />
  </Tab.Navigator>
  );
};

// 로그인 상태에서만 구독해야 해서, 조건부 렌더 가능한 컴포넌트로 감싼다.
const EntitlementSync = () => {
  useEntitlementSync();
  return null;
};

// 할 일 → 구글 캘린더 단방향 동기화. 로그인 중에만 돌아야 해서 EntitlementSync와 같이 감싼다.
// 무료 사용자는 연동 상태 조회 자체가 꺼져 있어 아무 요청도 하지 않는다.
const CalendarSync = () => {
  useSyncTodosToCalendar();
  return null;
};

// 서버 푸시 알림: 토큰 동기화, 예약 갱신 신호, 포그라운드 배너, 알림 탭 이동. 로그인 중에만 돈다.
const ReminderSync = () => {
  usePushTokenSync();
  useReminderRefresh();
  useForegroundReminders();
  useNotificationNavigation();
  useRefreshHistoryOnForeground();
  return null;
};

// 지난 실행에서 끝내지 못한 스토어 거래(검증 실패·앱 종료)를 로그인 직후 한 번 다시 검증한다.
// 서버 검증에 ID 토큰이 필요해 로그인 분기 안에서 마운트한다. resumePendingPurchases는 던지지 않는다.
const PendingPurchaseResume = () => {
  useEffect(() => {
    void resumePendingPurchases();
  }, []);
  return null;
};

export const RootNavigator = () => {
  const { user, loading } = useAuthState();
  // MainTabs는 로그인 중에만 마운트되므로, 로그아웃(uid -> null)을 보려면 항상 마운트된 여기서 호출해야 한다.
  useStartupMaintenance(user?.uid ?? null);

  // 푸시로 옮기기 전 예약해 둔 로컬 알림이 푸시와 겹쳐 울리지 않도록 앱 시작 시 한 번 취소한다.
  // 로그인 여부와 무관하다(로그아웃 상태에서도 옛 예약은 울린다) — 그래서 항상 마운트된 여기서 부른다.
  useEffect(() => {
    cancelLegacyLocalRemindersOnce().catch((error) => reportError(error, "reminder"));
  }, []);

  // 로그인 상태가 정해지면(로그인 화면 또는 탭) 네이티브 스플래시를 걷는다.
  useEffect(() => {
    if (!loading) hideSplash();
  }, [loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={flushPendingTodoDetail}>
      {user ? (
        <ReminderBannerProvider>
          {/* 할 일 저장 직후의 알림 권한 안내. 폼 화면은 저장하자마자 닫히므로 화면 밖에 둔다. */}
          <ReminderPromptProvider>
            <EntitlementSync />
            <CalendarSync />
            <ReminderSync />
            <PendingPurchaseResume />
            <MainTabs />
          </ReminderPromptProvider>
        </ReminderBannerProvider>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
};

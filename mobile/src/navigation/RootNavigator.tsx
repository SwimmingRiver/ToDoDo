import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { Sun, ListTodo, CalendarDays, UserRound } from "lucide-react-native";
import { useAuthState } from "../auth/useAuthState";
import { LoginScreen } from "../screens/LoginScreen";
import { TodayScreen } from "../screens/TodayScreen";
import { TodoListScreen } from "../screens/TodoListScreen";
import { TodoFormScreen } from "../screens/TodoFormScreen";
import { TodoDetailScreen } from "../screens/TodoDetailScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { AccountScreen } from "../screens/AccountScreen";
import { IconButton } from "../shared/ui/iconButton/IconButton";
import type { TodayStackParamList, TodoListStackParamList, CalendarStackParamList } from "./types";
import { colors } from "../theme/colors";

const TodayStack = createNativeStackNavigator<TodayStackParamList>();
const TodoListStack = createNativeStackNavigator<TodoListStackParamList>();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();
const Tab = createBottomTabNavigator();

// 세 스택 모두 Account 라우트를 가지므로 어느 탭에서든 헤더 아이콘으로 계정 화면에 간다.
// 계정 화면 자신은 options에서 headerRight를 지운다. navigation 타입을 스택별 ParamList가
// 아니라 navigate("Account")만 요구하는 모양으로 좁혀야 세 스택에 같은 함수를 넘길 수 있다.
const accountHeaderOptions = ({
  navigation,
}: {
  navigation: { navigate: (name: "Account") => void };
}): NativeStackNavigationOptions => ({
  headerRight: () => (
    <IconButton
      icon={UserRound}
      accessibilityLabel="계정"
      onPress={() => navigation.navigate("Account")}
    />
  ),
});

const accountScreenOptions: NativeStackNavigationOptions = { title: "계정", headerRight: undefined };

const TodayTabStack = () => (
  <TodayStack.Navigator screenOptions={accountHeaderOptions}>
    <TodayStack.Screen name="Today" component={TodayScreen} options={{ title: "오늘" }} />
    <TodayStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <TodayStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
    <TodayStack.Screen name="Account" component={AccountScreen} options={accountScreenOptions} />
  </TodayStack.Navigator>
);

const TodoListTabStack = () => (
  <TodoListStack.Navigator screenOptions={accountHeaderOptions}>
    <TodoListStack.Screen name="TodoList" component={TodoListScreen} options={{ title: "할 일" }} />
    <TodoListStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <TodoListStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
    <TodoListStack.Screen name="Account" component={AccountScreen} options={accountScreenOptions} />
  </TodoListStack.Navigator>
);

const CalendarTabStack = () => (
  <CalendarStack.Navigator screenOptions={accountHeaderOptions}>
    <CalendarStack.Screen name="Calendar" component={CalendarScreen} options={{ title: "캘린더" }} />
    <CalendarStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <CalendarStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
    <CalendarStack.Screen name="Account" component={AccountScreen} options={accountScreenOptions} />
  </CalendarStack.Navigator>
);

const MainTabs = () => (
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
  </Tab.Navigator>
);

export const RootNavigator = () => {
  const { user, loading } = useAuthState();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <NavigationContainer>{user ? <MainTabs /> : <LoginScreen />}</NavigationContainer>;
};

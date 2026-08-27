import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { Sun, ListTodo, CalendarDays } from "lucide-react-native";
import { useAuthState } from "../auth/useAuthState";
import { LoginScreen } from "../screens/LoginScreen";
import { TodayScreen } from "../screens/TodayScreen";
import { TodoListScreen } from "../screens/TodoListScreen";
import { TodoFormScreen } from "../screens/TodoFormScreen";
import { TodoDetailScreen } from "../screens/TodoDetailScreen";
import { CalendarPlaceholderScreen } from "../screens/CalendarPlaceholderScreen";
import type { TodayStackParamList, TodoListStackParamList, CalendarStackParamList } from "./types";
import { colors } from "../theme/colors";

const TodayStack = createNativeStackNavigator<TodayStackParamList>();
const TodoListStack = createNativeStackNavigator<TodoListStackParamList>();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();
const Tab = createBottomTabNavigator();

const TodayTabStack = () => (
  <TodayStack.Navigator>
    <TodayStack.Screen name="Today" component={TodayScreen} options={{ title: "오늘" }} />
    <TodayStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <TodayStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
  </TodayStack.Navigator>
);

const TodoListTabStack = () => (
  <TodoListStack.Navigator>
    <TodoListStack.Screen name="TodoList" component={TodoListScreen} options={{ title: "할 일" }} />
    <TodoListStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <TodoListStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
  </TodoListStack.Navigator>
);

const CalendarTabStack = () => (
  <CalendarStack.Navigator>
    <CalendarStack.Screen name="Calendar" component={CalendarPlaceholderScreen} options={{ title: "캘린더" }} />
    <CalendarStack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
    <CalendarStack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
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

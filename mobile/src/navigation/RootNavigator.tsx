import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useAuthState } from "../auth/useAuthState";
import { LoginScreen } from "../screens/LoginScreen";
import { TodoListScreen } from "../screens/TodoListScreen";
import { TodoFormScreen } from "../screens/TodoFormScreen";
import { TodoDetailScreen } from "../screens/TodoDetailScreen";

export type RootStackParamList = {
  Login: undefined;
  TodoList: undefined;
  TodoForm: { parentId?: string } | undefined;
  TodoDetail: { id: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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
          <Stack.Group>
            <Stack.Screen name="TodoList" component={TodoListScreen} options={{ title: "할 일" }} />
            <Stack.Screen name="TodoForm" component={TodoFormScreen} options={{ title: "할 일 추가" }} />
            <Stack.Screen name="TodoDetail" component={TodoDetailScreen} options={{ title: "할 일 상세" }} />
          </Stack.Group>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

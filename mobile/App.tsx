import "./src/firebase"; // 앱 시작 시 Firebase 초기화 강제
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

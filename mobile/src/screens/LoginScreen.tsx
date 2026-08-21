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

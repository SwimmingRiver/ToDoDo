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

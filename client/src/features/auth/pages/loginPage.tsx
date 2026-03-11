import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/shared/lib/firebase";
import { useNavigate } from "react-router-dom";

const LoginPage = () => {
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    await signInWithPopup(auth, googleProvider);
    navigate("/");
  };

  return (
    <div>
      <h1>ToDoDo</h1>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
    </div>
  );
};

export default LoginPage;

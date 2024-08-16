import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { firebaseAuth } from "../utils/firebaseConfig";
import axios from "axios";
import { CHECK_USER_ROUTE, LOGIN_USER_ROUTE } from "../utils/ApiRoutes";
import { useAppContext } from "../context/AppContext";
import { useState } from "react";

interface LoginData {
  email: string;
  password: string;
}

function Login() {
  const navigate = useNavigate();
  const { setUser, setLoggedIn } = useAppContext()!;

  const [form, setForm] = useState<LoginData>({
    email: "",
    password: "",
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prevUser: LoginData) => ({
      ...prevUser,
      [name]: value,
    }));
  };

  const handleLogin = async () => {
    const { data } = await axios.post(LOGIN_USER_ROUTE, form);
    console.log(data);
    if (!data.status) {
      //TODO toast
      navigate("/register");
    } else {
      //TODO toast
      setLoggedIn(true);
      navigate("/home");
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    const {
      user: { displayName: name, email, photoURL: profileImage },
    } = await signInWithPopup(firebaseAuth, provider);
    try {
      if (email) {
        const { data } = await axios.post(CHECK_USER_ROUTE, { email });
        console.log(data);
        if (!data.status) {
          //TODO toast
          setUser({ name, email, profileImage });
          navigate("/register");
        } else {
          //TODO toast
          setLoggedIn(true);
          setUser({ name, email, profileImage });
          navigate("/home");
        }
      }
    } catch (err) {
      console.log(err);
    }
  };
  return (
    <div className="w-full h-screen flex">
      <div className="hidden md:flex md:w-1/2 lg:w-2/3 h-screen flex-col">
        <img
          src="/cover.jpg"
          alt="cover image"
          className="w-full h-full object-contain"
        />
      </div>
      <div className="w-full md:w-2/3 lg:w-1/3 flex justify-center items-center h-full">
        <div className="w-full p-10 md:p-20 h-full flex flex-col items-center justify-between">
          <div className="w-full flex flex-col">
            <div className="flex justify-between mb-4">
              <div className="flex flex-col">
                <h3 className="text-3xl font-semibold mb-2">Login</h3>
                <p className="text-sm mb-2 text-primary">Welcome Back!</p>
              </div>
              <div>
                <img src="logo.png" alt="logo" width={100} />
              </div>
            </div>
            <div className="flex flex-col">
              <input
                type="email"
                name="email"
                onChange={handleChange}
                className="text-black my-2 py-2 border-b-2 border-primary outline-none bg-transparent"
                placeholder="Email"
              />
              <input
                type="password"
                name="password"
                onChange={handleChange}
                className="text-black my-2 py-2 border-b-2 border-primary outline-none bg-transparent"
                placeholder="Password"
              />
            </div>
            <div className="md:flex items-center justify-between mt-3">
              <label className="flex items-center">
                <input type="checkbox" className="w-4 h-4 mr-2" />
                <p className="text-sm cursor-pointer">Remember Me</p>
              </label>
              <p className="mt-5 md:mt-0 text-sm font-medium whitespace-nowrap cursor-pointer underline underline-offset-2">
                Forgot Password?
              </p>
            </div>
          </div>

          <div className="w-full flex flex-col mt-8 mb-3">
            <button
              className="w-full text-zinc-50 bg-primary hover:bg-violet-400 my-2 font-semibold rounded-md p-4 text-center flex items-center justify-center"
              onClick={handleLogin}
            >
              Login
            </button>
            <button
              className="my-2 border-2 border-secondary text-secondary hover:border-orange-200 hover:text-orange-300 font-semibold rounded-md p-4 text-center flex items-center justify-center bg-white"
              onClick={() => navigate("/register")}
            >
              Sign Up
            </button>
          </div>
          <div className="w-full flex items-center justify-center cursor-default">
            <div className="w-full border border-black h-[1px]"></div>
            <p className=" text-lg px-2 absolute text-black/80 bg-zinc-50">
              or
            </p>
          </div>
          <button
            className="w-full text-black my-2 bg-white border-2 border-black font-semibold rounded-md p-4 text-center flex items-center justify-center"
            onClick={handleGoogleSignIn}
          >
            <img src="google.png" alt="google logo" className="h-6 mr-5" />
            Sign In With Google
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;

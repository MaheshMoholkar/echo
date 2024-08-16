import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { firebaseAuth } from "../utils/firebaseConfig";
import axios from "axios";
import { CHECK_USER_ROUTE, REGISTER_USER_ROUTE } from "../utils/ApiRoutes";
import { useAppContext } from "../context/AppContext";
import { useEffect, useState } from "react";
import convertImageToBase64 from "../utils/util";

interface FormData {
  name: string;
  email: string;
  profileImage: string;
  password: string;
}

function Login() {
  const navigate = useNavigate();
  const { user, setUser, setLoggedIn } = useAppContext()!;

  const [validated, setValidated] = useState(false);
  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    profileImage: "",
    password: "",
  });

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name as string,
        email: user.email as string,
        profileImage: user.profileImage as string,
        password: "",
      });
    }
  }, [validated]);

  const handleRegister = async () => {
    const { data } = await axios.post(REGISTER_USER_ROUTE, form);
    console.log(data);
    if (!data.status) {
      //TODO toast
      navigate("/login");
    } else {
      //TODO toast
      setLoggedIn(true);
      navigate("/home");
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const {
        user: { displayName: name, email, photoURL },
      } = await signInWithPopup(firebaseAuth, provider);
      let profileImage = "";
      (async () => {
        try {
          const base64 = await convertImageToBase64(photoURL as string);
          profileImage = base64;
        } catch (error) {
          console.error("Error converting image:", error);
        }
      })();
      setUser({ name, email, profileImage });

      if (email) {
        const { data } = await axios.post(CHECK_USER_ROUTE, { email });
        console.log(data);
        if (!data.status) {
          // toast
          setValidated(true);
        } else {
          // toast
          setLoggedIn(true);
          setUser({ name, email, profileImage });
          navigate("/home");
        }
      }
    } catch (err) {
      console.error("Login error:", err);
    }
  };
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prevUser: FormData) => ({
      ...prevUser,
      [name]: value,
    }));
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
                <h3 className="text-3xl font-semibold mb-2">Sign Up</h3>
                <p className="text-sm mb-2 text-primary">Hello There!</p>
              </div>
              <div>
                <img src="logo.png" alt="logo" width={100} />
              </div>
            </div>
            <div className="flex flex-col">
              <input
                type="text"
                value={form.name}
                name="name"
                onChange={handleChange}
                className="text-black my-2 py-2 border-b-2 border-primary outline-none bg-transparent"
                placeholder="Name"
              />
              <input
                type="email"
                value={form.email}
                name="email"
                onChange={handleChange}
                className="text-black my-2 py-2 border-b-2 border-primary outline-none bg-transparent"
                placeholder="Email"
              />
              <input
                type="password"
                name="password"
                value={form.password}
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
              onClick={handleRegister}
            >
              Sign Up
            </button>
            <button
              className="my-2 border-2 border-secondary text-secondary hover:border-orange-200 hover:text-orange-300 font-semibold rounded-md p-4 text-center flex items-center justify-center bg-white"
              onClick={() => navigate("/login")}
            >
              Back to Login
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

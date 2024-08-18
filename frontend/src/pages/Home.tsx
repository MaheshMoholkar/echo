import { useEffect, useState } from "react";
import Layout from "../layout/HomeLayout";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "../utils/firebaseConfig";
import axios from "axios";
import { CHECK_USER_ROUTE } from "../utils/ApiRoutes";
import { useAppContext } from "../context/AppContext";
import { useNavigate } from "react-router-dom";
import Chat from "../components/Chat";
import EmptyChat from "../components/EmptyChat";

function Home() {
  const { user, setUser, loggedIn, activeUser } = useAppContext()!;
  const navigate = useNavigate();

  const [redirectLogin, setRedirectLogin] = useState(false);

  useEffect(() => {
    if (redirectLogin && !loggedIn) navigate("/login");
  }, [redirectLogin]);

  onAuthStateChanged(firebaseAuth, async (currentUser) => {
    if (!currentUser) setRedirectLogin(true);
    if (!user && currentUser?.email) {
      const { data } = await axios.post(CHECK_USER_ROUTE, {
        email: currentUser.email,
      });
      if (!data.status) {
        navigate("/login");
      }
      let { id, name, email, profileImage } = data.user;
      setUser({ id, name, email, profileImage });
    }
  });
  return <Layout>{activeUser ? <Chat /> : <EmptyChat />}</Layout>;
}

export default Home;

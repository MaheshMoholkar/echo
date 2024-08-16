import { useEffect, useState } from "react";
import EmptyConversation from "../components/EmptyConversation";
import Layout from "../layout/HomeLayout";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "../utils/firebaseConfig";
import axios from "axios";
import { CHECK_USER_ROUTE } from "../utils/ApiRoutes";
import { useAppContext } from "../context/AppContext";
import { useNavigate } from "react-router-dom";

function Home() {
  const { user, setUser } = useAppContext()!;
  const navigate = useNavigate();
  const [redirectLogin, setRedirectLogin] = useState(false);

  useEffect(() => {
    if (redirectLogin) navigate("/login");
  }, [redirectLogin]);

  onAuthStateChanged(firebaseAuth, async (currentUser) => {
    if (!currentUser) setRedirectLogin(true);
    if (!user && currentUser?.email) {
      const { data } = await axios.post(CHECK_USER_ROUTE, {
        email: currentUser.email,
      });
      console.log({ data });
      if (!data.status) {
        navigate("/login");
      }
      let { name, email, profileImage } = data.user;
      setUser({ name, email, profileImage });
    }
  });
  return (
    <Layout>
      <EmptyConversation />
    </Layout>
  );
}

export default Home;

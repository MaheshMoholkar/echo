import { useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";
import ConversationItem from "./ConversationItem";
import { GET_USERS_ROUTE } from "../utils/ApiRoutes";
import axios from "axios";

function ConversationList() {
  const { setActiveUser } = useAppContext()!;
  const [users, setUsers] = useState<any>();
  useEffect(() => {
    const getUsers = async () => {
      const { data } = await axios.get(GET_USERS_ROUTE);
      setUsers(data.users);
    };
    getUsers();
  }, []);

  const handleClick = (user: any) => {
    setActiveUser(user);
  };
  return (
    <div className="flex-auto overflow-auto max-h-full custom-scrollbar">
      {users?.map((user: any) => (
        <ConversationItem
          name={user.name}
          img={user.profileImage}
          message="Mahesh: Hi there"
          handleClick={() => handleClick(user)}
          key={user.name}
        />
      ))}
    </div>
  );
}

export default ConversationList;

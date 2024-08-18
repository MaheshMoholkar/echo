import { useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";
import ConversationItem from "./ConversationItem";
import { GET_USERS_ROUTE } from "../utils/ApiRoutes";
import axios from "axios";

function ConversationList() {
  const { user, setActiveUser } = useAppContext()!;
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
      {users?.map(
        (userEl: any) =>
          userEl.name !== user?.name && (
            <ConversationItem
              key={userEl.id}
              name={userEl.name}
              img={userEl.profileImage}
              message="Mahesh: Hi there" // You can update this to reflect actual last message
              handleClick={() => handleClick(userEl)}
            />
          )
      )}
    </div>
  );
}

export default ConversationList;

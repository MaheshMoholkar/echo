import axios from "axios";
import { useEffect, useState } from "react";
import { GET_MESSAGE_ROUTE } from "../utils/ApiRoutes";
import { useAppContext } from "../context/AppContext";

interface Message {
  id: number;
  createdAt: Date;
  senderId: number;
  receiverId: number;
  message: string;
  messageStatus: string;
}

function ChatContainer() {
  const { user, activeUser } = useAppContext()!;

  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const getMessages = async () => {
      try {
        const { data } = await axios.get(
          `${GET_MESSAGE_ROUTE}/?sender_id=${user?.id}&receiver_id=${activeUser?.id}`
        );
        setMessages(data.messages);
      } catch (error) {
        console.error("Error fetching messages:", error);
      }
    };

    if (user?.id && activeUser?.id) {
      getMessages();
    }
  }, [user?.id, activeUser?.id]);
  return (
    <div className="flex flex-col h-[80vh] w-full bg-gray-100">
      <div className="flex flex-col justify-end flex-grow px-10 overflow-auto bg-white">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex mb-2 ${
              message.senderId.toString() == activeUser?.id
                ? "justify-start"
                : "justify-end"
            }`}
          >
            <div
              className={`max-w-[75%] p-3 rounded-lg text-sm ${
                message.senderId.toString() == activeUser?.id
                  ? "bg-theme text-right text-white"
                  : "bg-gray-200 text-left"
              }`}
            >
              {message.message}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChatContainer;

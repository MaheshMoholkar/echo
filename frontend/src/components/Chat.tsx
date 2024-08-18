import { Paperclip, SendHorizontal, Dot, EllipsisVertical } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useRef, useState, useEffect } from "react";
import axios from "axios";
import { ADD_MESSAGE_ROUTE, GET_MESSAGE_ROUTE, HOST } from "../utils/ApiRoutes";
import { io, Socket } from "socket.io-client";

// Message interface
type Message = {
  id: number;
  createdAt: Date;
  senderId: string;
  recieverId: string;
  message: string;
  messageStatus: string;
};

function Chat() {
  const { user, activeUser, setSocket } = useAppContext()!;
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(false);

  const socket = useRef<Socket>();

  // Initialize socket connection and add user to socket
  useEffect(() => {
    if (user) {
      socket.current = io(HOST);
      socket.current.emit("add-user", user.id);
      setSocket(socket);

      if (activeUser?.id) {
        socket.current.emit("check-online", activeUser.id);
      }
    }
  }, [user, setSocket, activeUser]);

  // Listen for incoming messages
  useEffect(() => {
    if (socket.current) {
      const handleReceive = (data: any) => {
        const newMessage: Message = {
          id: data.id,
          createdAt: new Date(),
          senderId: data.senderId,
          recieverId: data.recieverId,
          message: data.message.message,
          messageStatus: "received",
        };
        setMessages((prevMessages) => [...prevMessages, newMessage]);
      };

      const handleOnlineStatus = (data: any) => {
        if (data.userId === activeUser?.id) {
          setIsOnline(data.isOnline);
        }
      };

      const handleTyping = (data: any) => {
        if (data.senderId === activeUser?.id) {
          setIsTyping(true);
          setTimeout(() => setIsTyping(false), 3000);
        }
      };

      socket.current.on("msg-recieve", handleReceive);
      socket.current.on("online-status", handleOnlineStatus);
      socket.current.on("typing", handleTyping);

      return () => {
        socket.current?.off("msg-recieve", handleReceive);
        socket.current?.off("online-status", handleOnlineStatus);
        socket.current?.off("typing", handleTyping);
      };
    }
  }, [socket.current, activeUser?.id]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socket.current) {
        socket.current.emit("disconnect", { userId: user?.id });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (socket.current) {
        socket.current.emit("disconnect", { userId: user?.id });
      }
    };
  }, [user?.id]);

  // Fetch messages between the current user and the active user
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

  // Handle sending a message
  const handleSend = async () => {
    if (message.length > 0) {
      try {
        const { data } = await axios.post(ADD_MESSAGE_ROUTE, {
          sender_id: user?.id,
          receiver_id: activeUser?.id,
          message: message,
        });
        socket?.current?.emit("send-msg", {
          sender_id: user?.id,
          reciever_id: activeUser?.id,
          message: data.message,
        });
        setMessages((prevMessages) => [...prevMessages, data.message]);
        setMessage("");
      } catch (err) {
        console.log(err);
      }
    } else {
      //TODO: toast
    }
  };

  // Handle input change
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const msg = event.target.value;
    setMessage(msg);
    socket.current?.emit("typing", {
      sender_id: user?.id,
      reciever_id: activeUser?.id,
    });
  };

  return (
    <div className="border-l">
      <div className="h-18 px-4 py-3 justify-between items-center bg-zinc-50">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img
              src={activeUser?.profileImage as string}
              alt="profile"
              className="rounded-full"
              height={45}
              width={45}
            />
            <div className="leading-none">
              <span className="flex items-center -mt-1">
                <p className="text-lg text-zinc-700 font-semibold">
                  {activeUser?.name}
                </p>
                <Dot size={40} color={isOnline ? "#04d238" : "#ccc"} />
              </span>
              <p className="text-zinc-400 -mt-1">
                {isTyping ? "Typing..." : ""}
              </p>
            </div>
          </div>
          <div>
            <EllipsisVertical
              className="text-zinc-700 cursor-pointer text-xl"
              xlinkTitle="Menu"
            />
          </div>
        </div>
      </div>

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
                className={`max-w-[75%] relative p-3 pr-4 rounded-lg text-sm ${
                  message.senderId.toString() == activeUser?.id
                    ? "bg-theme text-right text-white"
                    : "bg-gray-200 text-left"
                }`}
              >
                <p className="flex px-2 font-semibold">{message.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full border border-zinc-100 h-[1px]"></div>
      <div className="h-14 py-4 px-16 items-center gap-6">
        <div className="flex p-2 bg-zinc-100 rounded-lg">
          <input
            type="text"
            value={message}
            onChange={handleChange}
            placeholder="Type your message here"
            className="bg-transparent focus:outline-none w-full"
          />
          <div className="flex items-center gap-6 px-2">
            <Paperclip size={25} className="cursor-pointer text-red-600" />
            <SendHorizontal
              className="cursor-pointer p-2 bg-red-200 rounded text-red-600"
              size={35}
              onClick={handleSend}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Chat;

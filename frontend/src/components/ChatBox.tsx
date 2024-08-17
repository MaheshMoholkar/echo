import { Paperclip, SendHorizontal } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useState } from "react";
import axios from "axios";
import { ADD_MESSAGE_ROUTE } from "../utils/ApiRoutes";

function ChatBox() {
  const { user, activeUser } = useAppContext()!;
  const [message, setMessage] = useState<string>("");
  const handleSend = async () => {
    if (message.length > 0) {
      try {
        await axios.post(ADD_MESSAGE_ROUTE, {
          sender_id: user?.id,
          receiver_id: activeUser?.id,
          message: message,
        });
        setMessage("");
      } catch (err) {
        console.log(err);
      }
    } else {
      //TODO: toast
    }
  };
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const msg = event.target.value;
    setMessage(msg);
  };
  return (
    <>
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
    </>
  );
}

export default ChatBox;

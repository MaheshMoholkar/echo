import { Dot } from "lucide-react";
import Avatar from "./Avatar";
import { useState } from "react";
import { useAppContext } from "../context/AppContext";

function ConversationItem({
  name,
  img,
  message,
  handleClick,
}: {
  name: string;
  img?: string;
  message: string;
  handleClick: (user: any) => void;
}) {
  const [isOnline, _setIsOnline] = useState(true);
  const { activeUser } = useAppContext()!;
  return (
    <div
      onClick={handleClick}
      className={`flex cursor-pointer items-center ml-1 h-16 border-white border-l-4 ${
        activeUser?.name == name ? "border-l-red-500" : ""
      }`}
    >
      <div className="flex gap-5 min-w-fit px-5 pb-1">
        <Avatar img={img} />
        <div className="">
          <div className="flex items-center text-zinc-800">
            {name}{" "}
            <span className="flex items-center">
              <Dot className={isOnline ? "text-green-600" : "text-zinc-600"} />
              <p className="ml-1 text-xs text-zinc-600">5 min</p>
            </span>
          </div>
          <p className="text-zinc-600">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default ConversationItem;

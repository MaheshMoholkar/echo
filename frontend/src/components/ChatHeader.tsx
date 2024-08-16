import { Dot, EllipsisVertical } from "lucide-react";
import { useAppContext } from "../context/AppContext";

function ChatHeader() {
  let { activeUser } = useAppContext()!;
  return (
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
              <Dot size={40} color="#04d238" />
            </span>
            <p className="text-zinc-400 -mt-1">Typing...</p>
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
  );
}

export default ChatHeader;

import { EllipsisVertical } from "lucide-react";
import { useAppContext } from "../context/AppContext";

function ConversationHeader() {
  const { user } = useAppContext()!;
  return (
    <div className="h-18 px-4 py-3 flex justify-between items-center bg-red-500">
      <div className="flex items-center gap-4 cursor-pointer">
        <img
          src={user?.profileImage as string}
          alt="profile"
          className="rounded-full"
          height={45}
          width={45}
        />
        <p className="text-lg text-zinc-50 font-semibold">{user?.name}</p>
      </div>
      <div className="flex gap-6">
        <EllipsisVertical
          className="text-zinc-50 cursor-pointer text-xl"
          xlinkTitle="Menu"
        />
      </div>
    </div>
  );
}

export default ConversationHeader;

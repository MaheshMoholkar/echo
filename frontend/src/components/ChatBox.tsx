import { Paperclip, SendHorizontal } from "lucide-react";

function ChatBox() {
  return (
    <>
      <div className="w-full border border-zinc-100 h-[1px]"></div>
      <div className="h-14 py-4 px-16 items-center gap-6">
        <div className="flex p-2 bg-zinc-100 rounded-lg">
          <input
            type="text"
            placeholder="Type your message here"
            className="bg-transparent focus:outline-none w-full"
          />
          <div className="flex items-center gap-6 px-2">
            <Paperclip size={25} className="cursor-pointer text-red-600" />
            <SendHorizontal
              className="cursor-pointer p-2 bg-red-200 rounded text-red-600"
              size={35}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default ChatBox;

import ChatBox from "./ChatBox";
import ChatContainer from "./ChatContainer";
import ChatHeader from "./ChatHeader";

function Chat() {
  return (
    <div className="border-l">
      <ChatHeader />
      <ChatContainer />
      <ChatBox />
    </div>
  );
}

export default Chat;

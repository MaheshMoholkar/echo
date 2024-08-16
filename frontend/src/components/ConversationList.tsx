import Conversation from "./Conversation";

function ConversationList() {
  return (
    <div className="flex-auto overflow-auto max-h-full custom-scrollbar">
      <Conversation />
    </div>
  );
}

export default ConversationList;

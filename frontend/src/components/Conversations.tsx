import ConversationHeader from "./ConversationHeader";
import ConversationList from "./ConversationList";
import Search from "./Search";

function Conversations() {
  return (
    <>
      <div className="flex flex-col max-h-screen z-20">
        <>
          <ConversationHeader />
          <Search />
          <ConversationList />
        </>
      </div>
    </>
  );
}

export default Conversations;

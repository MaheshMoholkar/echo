import { ListFilter, SearchIcon } from "lucide-react";

function Search() {
  return (
    <>
      <div className="flex py-8 px-5 items-center gap-3 h-14">
        <div className="flex w-full items-center gap-5 py-1 rounded-lg">
          <div className="flex w-full gap-2 bg-zinc-100 p-3 rounded-lg border-2 border-zinc-300">
            <SearchIcon className="text-zinc-500 cursor-pointer text-lg" />
            <input
              type="text"
              placeholder="Search"
              className="text-sm bg-transparent focus:outline-none w-full"
            />
          </div>
        </div>
        <div className="pl-3">
          <ListFilter className="text-zinc-500 cursor-pointer text-lg" />
        </div>
      </div>
      <div className="w-full border border-zinc-100 h-[1px]"></div>
      <div className="flex p-3 px-4 gap-3 text-zinc-700 font-semibold">
        <button className="border border-zinc-300 rounded-full px-3 py-1 text-xs shadow-sm">
          All
        </button>
        <button className="border border-zinc-300 rounded-full px-3 py-1 text-xs shadow-sm">
          Unread
        </button>
        <button className="border border-zinc-300 rounded-full px-3 py-1 text-xs shadow-sm">
          Archived
        </button>
        <button className="border border-zinc-300 rounded-full px-3 py-1 text-xs shadow-sm">
          Blocked
        </button>
      </div>
      <div className="w-full border border-zinc-100 h-[1px]"></div>
    </>
  );
}

export default Search;

import Conversations from "../components/Conversations";

function Layout({ children }: { children: React.ReactNode }) {
  let isDarkMode = false;
  return (
    <div className={`${isDarkMode ? "dark" : "light"} flex overflow-hidden`}>
      <aside className="h-screen w-1/4">
        <Conversations />
      </aside>
      <main className="h-screen w-3/4">{children}</main>
    </div>
  );
}

export default Layout;

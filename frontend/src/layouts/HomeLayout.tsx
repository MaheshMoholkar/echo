import { useAppSelector } from "../state/redux";

function Layout({ children }: { children: React.ReactNode }) {
  const isDarkMode = useAppSelector((state) => state.global.isDarkMode);
  return (
    <div
      className={`${
        isDarkMode ? "dark" : "light"
      } flex bg-gray-50 text-gray-900 w-full min-h-screen`}
    >
      <aside>Conversations</aside>
      <main>{children}</main>
    </div>
  );
}

export default Layout;

import { createBrowserRouter, RouterProvider } from "react-router-dom";
import StoreProvider from "./state/redux";
import Home from "./pages/home";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
]);
function App() {
  return (
    <StoreProvider>
      <RouterProvider router={router} />;
    </StoreProvider>
  );
}

export default App;

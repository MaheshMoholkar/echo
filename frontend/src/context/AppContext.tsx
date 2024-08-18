import React, { MutableRefObject, useContext, useState } from "react";
import { Socket } from "socket.io-client";

export type User = {
  id: string | null;
  name: string | null;
  email: string | null;
  profileImage: string | null;
};

export type AppContextType = {
  user: User | undefined;
  setUser: (user: User) => void;
  loggedIn: boolean | undefined;
  setLoggedIn: (loggedIn: boolean) => void;
  activeUser: User | undefined;
  setActiveUser: (user: User) => void;
  socket: MutableRefObject<Socket | undefined> | undefined;
  setSocket: (socket: MutableRefObject<Socket | undefined>) => void;
};

const AppContext = React.createContext<AppContextType | undefined>(undefined);

export const AppContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [loggedIn, setLoggedIn] = useState<boolean | undefined>(undefined);
  const [user, setUser] = useState<User>();
  const [activeUser, setActiveUser] = useState<User>();
  const [socket, setSocket] = useState<MutableRefObject<Socket | undefined>>();

  const handleSetLoggedIn = (loggedIn: boolean) => {
    setLoggedIn(loggedIn);
  };
  const handleSetUser = (user: User) => {
    setUser(user);
  };
  const handleSetSocket = (socket: MutableRefObject<Socket | undefined>) => {
    setSocket(socket);
  };

  return (
    <AppContext.Provider
      value={{
        user: user,
        setUser: handleSetUser,
        loggedIn: loggedIn,
        setLoggedIn: handleSetLoggedIn,
        activeUser: activeUser,
        setActiveUser: setActiveUser,
        socket: socket,
        setSocket: handleSetSocket,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  return context;
};

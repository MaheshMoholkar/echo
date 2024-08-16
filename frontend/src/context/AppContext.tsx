import React, { useContext, useState } from "react";

export type User = {
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

  const handleSetLoggedIn = (loggedIn: boolean) => {
    setLoggedIn(loggedIn);
  };
  const handleSetUser = (user: User) => {
    setUser(user);
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

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCSu_kb9iYjXo1tQFf2EmGKJ-njM7H_9qU",

  authDomain: "echo-7e59e.firebaseapp.com",

  projectId: "echo-7e59e",

  storageBucket: "echo-7e59e.appspot.com",

  messagingSenderId: "371263675390",

  appId: "1:371263675390:web:86fc35ef0c4126a03efeaf",
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

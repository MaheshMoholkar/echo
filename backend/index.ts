import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import AuthRoutes from "./src/routes/AuthRoutes";
import UserRoutes from "./src/routes/UserRoutes";
import MessageRoutes from "./src/routes/MessageRoutes";

const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
};

export const onlineUsers = new Map<string, string>();

dotenv.config();
const app = express();

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/auth", AuthRoutes);
app.use("/api/user", UserRoutes);
app.use("/api/message", MessageRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server started on port ${process.env.PORT}`);
});

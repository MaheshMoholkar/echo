import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import AuthRoutes from "./src/routes/AuthRoutes";
import UserRoutes from "./src/routes/UserRoutes";
import MessageRoutes from "./src/routes/MessageRoutes";
import { Server } from "socket.io";
import path from "path";

dotenv.config();

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  optionsSuccessStatus: 200,
};

export const onlineUsers = new Map<UserId, string>();

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

// Serve static files from the dist folder
app.use(express.static(path.join(__dirname, "dist")));

// API routes
app.use("/api/auth", AuthRoutes);
app.use("/api/user", UserRoutes);
app.use("/api/message", MessageRoutes);

// Serve the index.html file from the dist folder on all non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const server = app.listen(process.env.PORT, () => {
  console.log(`Server started on port ${process.env.PORT}`);
});

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
  },
});

type UserId = number;

io.on("connection", (socket) => {
  let userId: UserId | null = null;

  socket.on("add-user", (id: UserId) => {
    userId = id;
    onlineUsers.set(userId, socket.id);
    io.emit("online-status", { userId, isOnline: true });
  });

  socket.on("send-msg", (data) => {
    const sendUserSocket = onlineUsers.get(data.reciever_id);
    if (sendUserSocket) {
      socket.to(sendUserSocket).emit("msg-recieve", {
        senderId: data.sender_id,
        recieverId: data.reciever_id,
        message: data.message,
      });
    }
  });

  socket.on("typing", (data) => {
    const sendUserSocket = onlineUsers.get(data.reciever_id);
    if (sendUserSocket) {
      socket.to(sendUserSocket).emit("typing", {
        senderId: data.sender_id,
        recieverId: data.reciever_id,
      });
    }
  });

  socket.on("check-online", (id: UserId) => {
    const isOnline = onlineUsers.has(id);
    socket.emit("online-status", { userId: id, isOnline });
  });

  socket.on("disconnect", () => {
    if (userId !== null) {
      io.emit("online-status", { userId, isOnline: false });
      onlineUsers.delete(userId);
    }
  });
});

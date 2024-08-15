import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import AuthRoutes from "./src/routes/AuthRoutes";

const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
};

dotenv.config();
const app = express();

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/auth", AuthRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server started on port ${process.env.PORT}`);
});

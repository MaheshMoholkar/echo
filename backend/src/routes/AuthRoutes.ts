import { Router } from "express";
import {
  checkUser,
  loginUser,
  registerUser,
} from "../controllers/AuthController";

const router = Router();

router.post("/check-user", checkUser);
router.post("/login-user", loginUser);
router.post("/register-user", registerUser);

export default router;

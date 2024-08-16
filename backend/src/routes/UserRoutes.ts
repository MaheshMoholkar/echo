import { Router } from "express";
import { getUsers } from "../controllers/UserController";

const router = Router();

router.get("/get-users", getUsers);

export default router;

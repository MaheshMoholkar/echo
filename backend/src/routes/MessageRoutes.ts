import { Router } from "express";
import { addMessage, getMessages } from "../controllers/MessageController";

const router = Router();

router.post("/add-message", addMessage);
router.get("/get-messages", getMessages);

export default router;

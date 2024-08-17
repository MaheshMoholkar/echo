import db from "../db/db";
import { messages } from "../db/schema";
import { onlineUsers } from "../..";

export const addMessage = async (req: any, res: any, next: any) => {
  try {
    const { message, sender_id, receiver_id } = req.body;

    if (!message || !sender_id || !receiver_id) {
      return res.status(400).send("Invalid message data");
    }

    const messageStatus = onlineUsers.has(receiver_id) ? "delivered" : "sent";

    const newMessage = await db
      .insert(messages)
      .values({
        message,
        senderId: sender_id,
        receiverId: receiver_id,
        messageStatus,
      })
      .returning()
      .execute();

    return res.status(201).send({ message: newMessage });
  } catch (err) {
    next(err);
  }
};

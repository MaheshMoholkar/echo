import db from "../db/db";
import { eq, or, sql, SQLWrapper } from "drizzle-orm";
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

    return res.status(201).send({ message: newMessage[0] });
  } catch (err) {
    next(err);
  }
};

export const getMessages = async (req: any, res: any, next: any) => {
  try {
    const { sender_id, receiver_id } = req.query;

    if (!sender_id || !receiver_id) {
      return res.status(400).send("Invalid query parameters");
    }

    // Query messages between sender and receiver efficiently
    const messagesList = await db
      .select()
      .from(messages)
      .where(
        sql`(${messages.senderId} = ${sender_id} AND ${messages.receiverId} = ${receiver_id}) OR (${messages.senderId} = ${receiver_id} AND ${messages.receiverId} = ${sender_id})`
      )
      .orderBy(messages.createdAt)
      .execute();

    const unreadMessages: any = [];

    messagesList.forEach(async (message, index) => {
      if (
        message.messageStatus !== "read" &&
        message.senderId === parseInt(receiver_id)
      ) {
        messagesList[index].messageStatus = "read";
        unreadMessages.push(message);
      }
      // await db
      //   .update(messages)
      //   .set({ messageStatus: "read" })
      //   .where(sql`${messages.id} = ${message.id}`)
      //   .execute();
    });

    return res
      .status(200)
      .send({ messages: messagesList, unreadMessages: unreadMessages });
  } catch (err) {
    next(err);
  }
};

import db from "../db/db";
import { users } from "../db/schema";

export const getUsers = async (req: any, res: any, next: any) => {
  try {
    const allUsers = await db.select().from(users).execute();

    if (allUsers.length === 0) {
      return res.status(404).json({ msg: "No users found", status: false });
    } else {
      return res.json({
        msg: "Users retrieved successfully",
        status: true,
        users: allUsers,
      });
    }
  } catch (err) {
    console.error("Error in getUsers:", err);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

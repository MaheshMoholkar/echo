import { eq } from "drizzle-orm";
import db from "../db/db";
import { users } from "../db/schema";

export const checkUser = async (req: any, res: any, next: any) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ msg: "Email is required", status: false });
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .execute();

    if (user.length === 0) {
      return res.status(404).json({ msg: "User not found", status: false });
    } else {
      return res.json({ msg: "User found", status: true, user: user[0] });
    }
  } catch (err) {
    console.error("Error in checkUser:", err);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

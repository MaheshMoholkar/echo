import { eq } from "drizzle-orm";
import db from "../db/db";
import { users } from "../db/schema";
import jwt from "jsonwebtoken";

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
      return res.json({ msg: "User not found", status: false });
    } else {
      return res.json({ msg: "User found", status: true, user: user[0] });
    }
  } catch (err) {
    console.error("Error in checkUser:", err);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

export const loginUser = async (req: any, res: any, next: any) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ msg: "Email and password are required", status: false });
    }

    // Check if the user exists
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .execute();

    if (user.length === 0) {
      return res
        .status(401)
        .json({ msg: "Invalid email or password", status: false });
    }

    // Compare the provided password with the stored hashed password
    const isPasswordValid = password == user[0].password;

    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ msg: "Invalid email or password", status: false });
    }

    // Generate a JWT token
    const token = jwt.sign(
      { id: user[0].id, email: user[0].email },
      process.env.AUTH_SECRET as string,
      { expiresIn: "1h" }
    );

    return res.json({
      msg: "Login successful",
      status: true,
      token: token,
      user: {
        id: user[0].id,
        email: user[0].email,
        name: user[0].name,
        profileImage: user[0].profileImage,
      },
    });
  } catch (err) {
    console.error("Error in loginUser:", err);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

export const registerUser = async (req: any, res: any, next: any) => {
  try {
    const { email, name, password, profileImage } = req.body;

    if (!email || !name || !password) {
      return res
        .status(400)
        .json({ msg: "All fields are required", status: false });
    }

    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .execute();

    if (existingUser.length > 0) {
      return res
        .status(409)
        .json({ msg: "User already exists", status: false });
    }

    const newUser = {
      email,
      name,
      password,
      profileImage,
    };

    await db.insert(users).values(newUser).execute();

    return res
      .status(201)
      .json({ msg: "User registered successfully", status: true });
  } catch (err) {
    console.error("Error in registerUser:", err);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

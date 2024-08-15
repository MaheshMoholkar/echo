import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const sql = postgres("postgres://postgres:root@localhost:5432/echo-db", {
  max: 1,
});
const db = drizzle(sql);

export default db;

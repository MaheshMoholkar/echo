import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { jwt, organization } from "better-auth/plugins"
import { Pool } from "pg"

// Better Auth owns its tables (user, session, account, verification,
// organization, member, invitation, jwks) in the `auth` schema; FastAPI's
// tables live in `public`. `make auth-migrate` creates the schema and tables.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=auth",
})

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"

/** Audience of the tokens we mint for FastAPI; it must check this value. */
export const API_AUDIENCE = "echo-api"

async function firstOrganizationId(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ organizationId: string }>(
    'select "organizationId" from member where "userId" = $1 order by "createdAt" limit 1',
    [userId]
  )
  return rows[0]?.organizationId ?? null
}

export const auth = betterAuth({
  baseURL,
  database: pool,
  emailAndPassword: { enabled: true },
  databaseHooks: {
    session: {
      create: {
        // Log straight into the user's first organization, if they have one.
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await firstOrganizationId(session.userId),
          },
        }),
      },
    },
  },
  plugins: [
    organization(),
    // Short-lived tokens for FastAPI. Signed with an Ed25519 private key that
    // Better Auth generates and stores (encrypted) in auth.jwks; the public
    // half is published at /api/auth/jwks for FastAPI to verify signatures.
    jwt({
      jwt: {
        issuer: baseURL,
        audience: API_AUDIENCE,
        expirationTime: "15m",
        // Only what the API needs; `sub` (the user id) is added automatically.
        definePayload: ({ user, session }) => ({
          email: user.email,
          name: user.name,
          orgId: session.activeOrganizationId ?? null,
        }),
      },
    }),
    nextCookies(), // keep last: lets server actions set auth cookies
  ],
})

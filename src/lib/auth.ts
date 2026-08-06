import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

const db = new Database("auth.db");

export const auth = betterAuth({
  database: db,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  secret:
    process.env.BETTER_AUTH_SECRET ||
    "development_secret_key_32_characters_minimum_for_better_auth_gemini_ui",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
});

"use server";
import { setPrivateSession } from "@/lib/server-auth";

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const mistiEmail = process.env.MISTI_EMAIL || "";
  const divyaniEmail = process.env.DIVYANI_EMAIL || "";
  const mistiPwd = process.env.MISTI_PWD || "";
  const divyaniPwd = process.env.DIVYANI_PWD || "";

  if (!mistiEmail || !divyaniEmail || !mistiPwd || !divyaniPwd) {
    console.warn("Authentication credentials are not fully configured in environment variables.");
    return false;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const isMisti = normalizedEmail === mistiEmail.toLowerCase().trim() && password === mistiPwd;
  const isDivyani = normalizedEmail === divyaniEmail.toLowerCase().trim() && password === divyaniPwd;

  if (!isMisti && !isDivyani) return false;

  await setPrivateSession(isMisti ? "misti" : "divyani");
  return true;
}

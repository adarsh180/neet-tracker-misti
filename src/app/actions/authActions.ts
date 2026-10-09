"use server";
import { setPrivateSession, verifyCredentialUser } from "@/lib/server-auth";

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const session = await verifyCredentialUser(email, password);
  if (!session) return false;

  await setPrivateSession(session.userId);
  return true;
}

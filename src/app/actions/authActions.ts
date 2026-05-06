"use server";
import { resolveCredentialUser, setPrivateSession } from "@/lib/server-auth";

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const session = resolveCredentialUser(email, password);
  if (!session) return false;

  await setPrivateSession(session.userId);
  return true;
}

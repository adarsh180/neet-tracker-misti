"use server";

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const mistiEmail = process.env.MISTI_EMAIL || "";
  const divyaniEmail = process.env.DIVYANI_EMAIL || "";
  const mistiPwd = process.env.MISTI_PWD || "";
  const divyaniPwd = process.env.DIVYANI_PWD || "";

  if (!mistiEmail || !divyaniEmail || !mistiPwd || !divyaniPwd) {
    console.warn("Authentication credentials are not fully configured in environment variables.");
    return false;
  }

  return (
    (email.toLowerCase().trim() === mistiEmail.toLowerCase().trim() || 
     email.toLowerCase().trim() === divyaniEmail.toLowerCase().trim()) &&
    (password === mistiPwd || password === divyaniPwd)
  );
}

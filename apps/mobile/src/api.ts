import { fetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  apiUrl,
  COOKIE_NAME,
  extractSessionCookie,
  parseMetrics,
  parseSubjects,
  parseTaskReceipt,
  parseTasks,
  type Task,
} from "./contracts";

const SESSION_KEY = "neet-studio.trusted-session.v1";
let session: string | null = null;
export class SessionExpired extends Error {
  constructor() {
    super("Please sign in again to access your saved study records.");
  }
}
export async function restoreSession() {
  if (Platform.OS === "web") return false;
  session = await SecureStore.getItemAsync(SESSION_KEY);
  return Boolean(session);
}
export async function forgetSession() {
  session = null;
  if (Platform.OS !== "web") await SecureStore.deleteItemAsync(SESSION_KEY);
}
async function request(
  path: string,
  options: { method?: string; body?: unknown; anonymous?: boolean } = {},
) {
  if (Platform.OS === "web")
    throw new Error(
      "Sign-in is available in the Android/iOS development build. The browser preview does not store private sessions.",
    );
  if (!options.anonymous && !session) throw new SessionExpired();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(apiUrl(path), {
      method: options.method || "GET",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(!options.anonymous && session
          ? { Cookie: `${COOKIE_NAME}=${session}` }
          : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 401 && !options.anonymous) {
      await forgetSession();
      throw new SessionExpired();
    }
    if (!response.ok || response.status === 202) {
      if (options.anonymous && response.status === 401)
        throw new Error("Email or password is incorrect.");
      if (response.status === 429)
        throw new Error(
          "Too many sign-in attempts. Please wait before retrying.",
        );
      throw new Error(
        response.status === 202
          ? "This change is not confirmed as saved. Refresh before retrying."
          : "The study studio could not confirm this request. Check your connection and retry.",
      );
    }
    return { body, headers: response.headers };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "The connection took too long. The save status is unknown; refresh before retrying a change.",
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export async function signIn(email: string, password: string) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: { email: email.trim(), password },
    anonymous: true,
  });
  const token = extractSessionCookie(result.headers.get("set-cookie"));
  await SecureStore.setItemAsync(SESSION_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  session = token;
  await verifySession();
}
export async function verifySession() {
  const { body } = await request("/api/auth/session");
  if (
    !body ||
    typeof body !== "object" ||
    !("authenticated" in body) ||
    body.authenticated !== true
  )
    throw new SessionExpired();
}
export async function signOut() {
  // Do not claim a server revocation succeeded when offline.
  await request("/api/auth/logout", { method: "POST" });
  await forgetSession();
}
export async function loadWorkspace() {
  const [metrics, subjects, tasks] = await Promise.all([
    request("/api/dashboard/metrics"),
    request("/api/subjects"),
    request("/api/tasks"),
  ]);
  return {
    metrics: parseMetrics(metrics.body),
    subjects: parseSubjects(subjects.body),
    tasks: parseTasks(tasks.body),
    loadedAt: new Date(),
  };
}
export async function completeTask(id: string) {
  const { body } = await request(
    `/api/tasks/${encodeURIComponent(id)}/transition`,
    { method: "POST", body: { status: "DONE" } },
  );
  return parseTaskReceipt(body, id, "DONE" satisfies Task["status"]);
}

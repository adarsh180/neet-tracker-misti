export function getStoredAuth(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("neet_auth") === "authenticated";
}

export function setAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("neet_auth", "authenticated");
  localStorage.setItem("neet_auth_time", Date.now().toString());
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("neet_auth");
  localStorage.removeItem("neet_auth_time");
}


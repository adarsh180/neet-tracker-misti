"use client";

const QUEUE_KEY = "neet_offline_mutation_queue_v1";
const QUEUE_EVENT = "neet-offline-queue-change";

type QueuedMutation = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  createdAt: number;
};

const SAFE_MUTATION_PATHS = [
  "/api/daily-goals",
  "/api/mood",
  "/api/tests",
  "/api/tasks",
  "/api/topics",
  "/api/cycle",
  "/api/error-logs",
];

function readQueue(): QueuedMutation[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedMutation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { count: queue.length } }));
}

function requestPath(input: RequestInfo | URL) {
  const value = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return new URL(value, window.location.origin).pathname;
}

function shouldQueue(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;

  const path = requestPath(input);
  if (path.includes("/analysis") || path.includes("/ai/")) return false;
  return SAFE_MUTATION_PATHS.some((safePath) => path === safePath || path.startsWith(`${safePath}/`));
}

function headersToRecord(headers?: HeadersInit) {
  const record: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

async function bodyToString(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof init?.body === "string") return init.body;
  if (init?.body instanceof URLSearchParams) return init.body.toString();
  if (input instanceof Request) return input.clone().text();
  return init?.body ? String(init.body) : null;
}

async function enqueueMutation(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method || (input instanceof Request ? input.method : "POST")).toUpperCase();
  const sourceHeaders = init?.headers || (input instanceof Request ? input.headers : undefined);
  const mutation: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, window.location.origin).toString(),
    method,
    headers: headersToRecord(sourceHeaders),
    body: await bodyToString(input, init),
    createdAt: Date.now(),
  };

  const queue = [...readQueue(), mutation].slice(-120);
  writeQueue(queue);
  return new Response(JSON.stringify({ offlineQueued: true, queueLength: queue.length }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
}

export function getOfflineQueueCount() {
  return readQueue().length;
}

export function subscribeOfflineQueue(listener: (count: number) => void) {
  const handler = () => listener(getOfflineQueueCount());
  window.addEventListener(QUEUE_EVENT, handler);
  window.addEventListener("storage", handler);
  listener(getOfflineQueueCount());

  return () => {
    window.removeEventListener(QUEUE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export async function flushOfflineQueue(fetchImpl: typeof fetch = window.fetch.bind(window)) {
  if (!navigator.onLine) return getOfflineQueueCount();

  const queue = readQueue();
  const remaining: QueuedMutation[] = [];

  for (const mutation of queue) {
    try {
      const response = await fetchImpl(mutation.url, {
        method: mutation.method,
        headers: {
          ...mutation.headers,
          "x-offline-replay": "1",
        },
        body: mutation.body,
      });

      if (!response.ok) remaining.push(mutation);
    } catch {
      remaining.push(mutation);
    }
  }

  writeQueue(remaining);
  return remaining.length;
}

export function installOfflineMutationQueue() {
  if (typeof window === "undefined") return () => {};
  if ((window as typeof window & { __neetOfflineQueueInstalled?: boolean }).__neetOfflineQueueInstalled) {
    return () => {};
  }

  const originalFetch = window.fetch.bind(window);
  (window as typeof window & { __neetOfflineQueueInstalled?: boolean }).__neetOfflineQueueInstalled = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldQueue(input, init) || headersToRecord(init?.headers)["x-offline-replay"]) {
      return originalFetch(input, init);
    }

    if (!navigator.onLine) return enqueueMutation(input, init);

    try {
      return await originalFetch(input, init);
    } catch (error) {
      return enqueueMutation(input, init);
    }
  };

  const handleOnline = () => {
    void flushOfflineQueue(originalFetch);
  };

  window.addEventListener("online", handleOnline);
  void flushOfflineQueue(originalFetch);

  return () => {
    window.fetch = originalFetch;
    window.removeEventListener("online", handleOnline);
    (window as typeof window & { __neetOfflineQueueInstalled?: boolean }).__neetOfflineQueueInstalled = false;
  };
}

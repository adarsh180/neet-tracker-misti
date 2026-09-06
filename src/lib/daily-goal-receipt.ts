/** Only explicit server acknowledgements count as persisted study entries. */
export function acknowledgedDailyGoalIds(status: number, payload: unknown, requestedIds: string[]): Set<string> {
  const acknowledged = new Set<string>();
  if (status < 200 || status >= 300 || status === 202 || !payload || typeof payload !== "object") return acknowledged;
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return acknowledged;
  const requested = new Set(requestedIds);
  for (const result of results) {
    if (result && typeof result.id === "string" && result.ok === true && requested.has(result.id)) acknowledged.add(result.id);
  }
  return acknowledged;
}

/** Preserve entries edited or added while an older queue snapshot was syncing. */
export function reconcileDailyGoalQueue<T extends { id: string }>(current: T[], sent: T[], acknowledged: Set<string>): T[] {
  const snapshots = new Map(sent.map(entry => [entry.id, JSON.stringify(entry)]));
  return current.filter(entry => !acknowledged.has(entry.id) || snapshots.get(entry.id) !== JSON.stringify(entry));
}

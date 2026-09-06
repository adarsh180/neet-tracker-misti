/** Bounded Prisma 6 MySQL pools; explicit deployment settings always win. */
export function databaseConnectionUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "mysql:") return value;
    const defaults = { connection_limit: "5", connect_timeout: "15", pool_timeout: "15" };
    for (const [key, setting] of Object.entries(defaults)) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, setting);
    }
    return url.toString();
  } catch {
    // Let Prisma report invalid configuration without logging the secret URL.
    return value;
  }
}

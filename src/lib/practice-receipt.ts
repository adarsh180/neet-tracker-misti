/** A queued request is not a saved attempt. Validate identity as well as HTTP status. */
export async function readPracticeReceipt<T extends { id: string; status: string }>(
  response: Response, testId: string, expectedStatus?: string,
): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || response.status === 202 || body?.test?.id !== testId ||
      typeof body.test.status !== "string" || (expectedStatus && body.test.status !== expectedStatus)) {
    throw new Error(typeof body?.error === "string" ? body.error : "Your attempt is not confirmed as saved. Keep it open and retry.");
  }
  return body.test as T;
}

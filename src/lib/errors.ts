export function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e));
}
export function errMsg(e: unknown): string {
  return asError(e).message;
}

// src/lib/notify.ts
export function notify(msg: string) {
  if (typeof window !== "undefined") alert(msg);
}

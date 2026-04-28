// Shared toast/error helper. Replaces ad-hoc `onError: (err: any) => …`
// patterns in mutation callbacks so we get a single, type-safe place that
// understands the shape of API errors from the generated client.
//
// The generated client's `ErrorType` is an `ApiError` instance that always
// exposes `status` and `data`. `data` is whatever JSON the server returned —
// typically `{ error: string }` for our routes. We probe a couple of common
// shapes (`error`, `message`) so this works for both our handlers and any
// third-party error.

export type NormalizedError = {
  status?: number;
  message: string;
};

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function normalizeError(
  e: unknown,
  fallback = "Server error",
): NormalizedError {
  if (isObject(e) && "status" in e && "data" in e) {
    const status =
      typeof e.status === "number" ? (e.status as number) : undefined;
    const data = (e as { data?: unknown }).data;
    const baseMessage =
      "message" in e && typeof e.message === "string" ? e.message : undefined;
    const message =
      getStringField(data, "error") ??
      getStringField(data, "message") ??
      baseMessage ??
      fallback;
    return { status, message };
  }
  if (e instanceof Error) {
    return { message: e.message || fallback };
  }
  if (isObject(e)) {
    const response = (e as { response?: { status?: number; data?: unknown } })
      .response;
    const status =
      response?.status ??
      (typeof (e as { status?: unknown }).status === "number"
        ? ((e as { status: number }).status as number)
        : undefined);
    const data = response?.data ?? (e as { data?: unknown }).data;
    const baseMessage =
      typeof (e as { message?: unknown }).message === "string"
        ? ((e as { message: string }).message)
        : undefined;
    const message =
      getStringField(data, "error") ??
      getStringField(data, "message") ??
      baseMessage ??
      fallback;
    return { status, message };
  }
  return { message: fallback };
}

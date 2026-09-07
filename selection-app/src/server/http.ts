import { NextResponse } from "next/server";

/** Map a service error (code on the Error) to an HTTP response. */
export function errorResponse(err: unknown): NextResponse {
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : "Request failed.";
  const status =
    code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : code === "CONFLICT" ? 409 : code === "INVALID" ? 400 : 0;
  if (!status) throw err;
  return NextResponse.json({ error: message }, { status });
}

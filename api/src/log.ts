// The only place in the Worker allowed to call console (a test in api/test/api.test.ts enforces that).
//
// Why so strict: `[observability.logs]` sends whatever a Worker writes to Cloudflare Workers Logs, where it is kept
// for days and read by whoever can open the dashboard. A D1 error message can quote the statement and its bound
// values, which for a report means the per-day dedupe hash (`client_nonce`), a steward's note, or a masked detail. So
// nothing derived from a request or from an error may ever be written: the request path logs nothing at all, not even
// the route pattern, because Workers Logs stamps its own second-precision time and that alone would turn an error
// into a "somebody was at this screen at 17:41:37" record (CLAUDE.md: timestamps at minute granularity).
//
// What is left is the nightly cron, where no request and no person is in the frame. It may say which pass failed, in
// these exact words and no others - the type is the allow-list, so a caller cannot smuggle in a message.

export type FixedMessage = 'the nightly photo pass failed' | 'the nightly retention pass failed';

/** Writes one of a handful of fixed sentences. Never a request, an id, a body, or an error message. */
export function logFixed(message: FixedMessage): void {
  console.warn(message);
}

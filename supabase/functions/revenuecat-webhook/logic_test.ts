// Unit tests for the RevenueCat webhook decision logic.
// Run: deno test --node-modules-dir=none logic_test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { collectProfileIds, deriveFromEvent, type RCEvent } from "./logic.ts";

const NOW = Date.UTC(2026, 0, 15); // fixed clock
const FUTURE = NOW + 30 * 24 * 3600 * 1000; // +30 days
const PAST = NOW - 24 * 3600 * 1000; // -1 day

Deno.test("INITIAL_PURCHASE grants premium (purchase -> true)", () => {
  const ev: RCEvent = { type: "INITIAL_PURCHASE", expiration_at_ms: FUTURE };
  const r = deriveFromEvent(ev, NOW);
  assertEquals(r.active, true);
  assertEquals(r.expiresAt, new Date(FUTURE).toISOString());
});

Deno.test("RENEWAL keeps premium active", () => {
  assertEquals(deriveFromEvent({ type: "RENEWAL", expiration_at_ms: FUTURE }, NOW).active, true);
});

Deno.test("CANCELLATION alone does NOT revoke while entitlement still valid", () => {
  // User turned off auto-renew but still has paid time left.
  const r = deriveFromEvent({ type: "CANCELLATION", expiration_at_ms: FUTURE }, NOW);
  assertEquals(r.active, true);
});

Deno.test("EXPIRATION revokes premium (cancel -> lapse -> false)", () => {
  const r = deriveFromEvent({ type: "EXPIRATION", expiration_at_ms: PAST }, NOW);
  assertEquals(r.active, false);
});

Deno.test("REFUND revokes premium immediately", () => {
  assertEquals(deriveFromEvent({ type: "REFUND", expiration_at_ms: FUTURE }, NOW).active, false);
});

Deno.test("BILLING_ISSUE within grace period keeps access until expiry", () => {
  assertEquals(deriveFromEvent({ type: "BILLING_ISSUE", expiration_at_ms: FUTURE }, NOW).active, true);
});

Deno.test("BILLING_ISSUE past expiry revokes access", () => {
  assertEquals(deriveFromEvent({ type: "BILLING_ISSUE", expiration_at_ms: PAST }, NOW).active, false);
});

Deno.test("Launch reconcile after expiry -> false (expired grant event)", () => {
  // A RENEWAL whose expiry has already elapsed must not grant.
  assertEquals(deriveFromEvent({ type: "RENEWAL", expiration_at_ms: PAST }, NOW).active, false);
});

Deno.test("collectProfileIds filters anonymous ids and dedupes", () => {
  const ev: RCEvent = {
    app_user_id: "user-123",
    original_app_user_id: "user-123",
    aliases: ["$RCAnonymousID:abc", "user-456"],
  };
  assertEquals(collectProfileIds(ev).sort(), ["user-123", "user-456"]);
});

Deno.test("collectProfileIds returns empty for anonymous-only subscriber", () => {
  assertEquals(collectProfileIds({ app_user_id: "$RCAnonymousID:xyz" }), []);
});

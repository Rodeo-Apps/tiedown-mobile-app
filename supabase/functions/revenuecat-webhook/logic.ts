// Pure, side-effect-free decision logic for the RevenueCat webhook.
// Kept separate from index.ts so it can be unit-tested without booting the
// HTTP server or a Supabase client.

export const ENTITLEMENT_ID = "rodeo_apps_premium";

export interface RCEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  id?: string;
}

// Event types that always grant / refresh access.
export const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
]);

// Event types that must revoke access outright.
// NOTE: CANCELLATION means the user turned off auto-renew — they usually keep
// access until EXPIRATION, so we do NOT revoke on CANCELLATION alone; we rely
// on the live entitlement / expiration timestamp instead.
export const REVOKE_EVENTS = new Set([
  "EXPIRATION",
  "REFUND",
  "SUBSCRIPTION_PAUSED",
]);

/**
 * Decide access purely from the webhook event, used when the authoritative
 * RevenueCat REST API is unavailable (no key configured / network failure).
 *
 * @param now injectable clock for deterministic tests (defaults to Date.now())
 */
export function deriveFromEvent(
  event: RCEvent,
  now: number = Date.now(),
): { active: boolean; expiresAt: string | null } {
  const type = event.type ?? "";
  const expiresAt =
    typeof event.expiration_at_ms === "number"
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

  if (REVOKE_EVENTS.has(type)) return { active: false, expiresAt };

  if (GRANT_EVENTS.has(type)) {
    // If an expiration is supplied and already in the past, treat as expired.
    if (typeof event.expiration_at_ms === "number" && event.expiration_at_ms <= now) {
      return { active: false, expiresAt };
    }
    return { active: true, expiresAt };
  }

  // CANCELLATION / BILLING_ISSUE and anything else: keep access until the known
  // expiration timestamp elapses. If no timestamp, leave active.
  if (typeof event.expiration_at_ms === "number") {
    return { active: event.expiration_at_ms > now, expiresAt };
  }
  return { active: true, expiresAt };
}

/**
 * Collect the candidate profile ids for a subscriber from the event, filtering
 * out RevenueCat anonymous ids (which never map to a Supabase user).
 */
export function collectProfileIds(event: RCEvent): string[] {
  const ids = new Set<string>();
  for (const v of [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
  ]) {
    if (v && !v.startsWith("$RCAnonymousID:")) ids.add(v);
  }
  return Array.from(ids);
}

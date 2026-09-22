import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  collectProfileIds,
  deriveFromEvent,
  ENTITLEMENT_ID,
  type RCEvent,
} from "./logic.ts";

// =====================================================================
// revenuecat-webhook
//
// Receives RevenueCat webhook events and keeps profiles.has_premium_access
// in sync with the subscriber's LIVE entitlement state. This is the piece
// that revokes premium — before it existed, has_premium_access was set true
// on purchase and never set back to false, so cancelled / lapsed / refunded
// subscribers kept premium forever.
//
// Shared verbatim across every RevenueCat RodeoApps event app. They all use
// the same Supabase project (qptqfjtwonnfdaqlmrhj) and the same
// `rodeo_apps_premium` entitlement, so a single deployed function serves all.
//
// Configure in the RevenueCat dashboard (Project > Integrations > Webhooks):
//   URL:            https://<project>.functions.supabase.co/revenuecat-webhook
//   Authorization:  the exact value of the REVENUECAT_WEBHOOK_AUTH secret
//
// Required function secrets (supabase secrets set ...):
//   SUPABASE_URL                 (auto-populated by the platform)
//   SUPABASE_SERVICE_ROLE_KEY    (auto-populated by the platform)
//   REVENUECAT_WEBHOOK_AUTH      shared secret matching the dashboard header
//   REVENUECAT_API_KEY           (optional) RC secret key (sk_...) used to
//                                re-fetch authoritative entitlements per event
// =====================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Ask RevenueCat for the subscriber's authoritative entitlement state.
// Returns null when no API key is configured or the call fails, so callers can
// fall back to event-type based logic.
async function fetchLiveEntitlement(
  appUserId: string,
): Promise<{ active: boolean; expiresAt: string | null } | null> {
  const apiKey = Deno.env.get("REVENUECAT_API_KEY");
  if (!apiKey || !appUserId) return null;
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!res.ok) return null;
    const body = await res.json();
    const ent = body?.subscriber?.entitlements?.[ENTITLEMENT_ID];
    if (!ent) return { active: false, expiresAt: null };
    const expires = ent.expires_date ? new Date(ent.expires_date) : null;
    // null expires_date => lifetime/non-expiring entitlement => active.
    const active = !expires || expires.getTime() > Date.now();
    return { active, expiresAt: expires ? expires.toISOString() : null };
  } catch {
    return null;
  }
}

async function logEvent(
  event: RCEvent,
  raw: unknown,
  resolved: { active: boolean; expiresAt: string | null },
  source: string,
) {
  try {
    await supabase.from("revenuecat_webhook_events").insert({
      event_id: event.id ?? null,
      event_type: event.type ?? "unknown",
      app_user_id: event.app_user_id ?? event.original_app_user_id ?? null,
      entitlement_id: event.entitlement_id ?? null,
      resolved_active: resolved.active,
      resolved_expires_at: resolved.expiresAt,
      resolution_source: source,
      payload: raw,
    });
  } catch (err) {
    // Never let audit logging break the webhook response.
    console.error("[revenuecat-webhook] failed to log event", err);
  }
}

// Update every profile row that could correspond to this subscriber. RevenueCat
// identifies subscribers by app_user_id (we set it to the Supabase auth uid via
// Purchases.logIn) but also carries aliases / original_app_user_id.
async function applyToProfiles(
  event: RCEvent,
  resolved: { active: boolean; expiresAt: string | null },
): Promise<number> {
  const ids = collectProfileIds(event);
  if (ids.length === 0) return 0;

  const update: Record<string, unknown> = {
    has_premium_access: resolved.active,
    premium_expires_at: resolved.expiresAt,
  };
  // Only stamp the source when granting, so we don't overwrite the origin of a
  // manually-granted comp when revoking.
  if (resolved.active) update.premium_source = "revenuecat";

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .in("id", ids)
    .select("id");

  if (error) {
    console.error("[revenuecat-webhook] profile update failed", error);
    throw error;
  }
  return data?.length ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Verify the shared Authorization header configured in the RC dashboard.
  const expectedAuth = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
  if (expectedAuth) {
    const got = req.headers.get("Authorization");
    if (got !== expectedAuth) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event: RCEvent = (raw as { event?: RCEvent })?.event ?? {};
  const appUserId = event.app_user_id ?? event.original_app_user_id ?? "";

  // Prefer the authoritative live entitlement; fall back to event-type logic.
  let resolved = await fetchLiveEntitlement(appUserId);
  let source = "revenuecat_api";
  if (!resolved) {
    resolved = deriveFromEvent(event);
    source = "event_type";
  }

  await logEvent(event, raw, resolved, source);

  let updated = 0;
  try {
    updated = await applyToProfiles(event, resolved);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "profile update failed", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      received: true,
      event_type: event.type ?? "unknown",
      resolved_active: resolved.active,
      profiles_updated: updated,
      resolution_source: source,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

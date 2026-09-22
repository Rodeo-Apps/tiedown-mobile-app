import Purchases, { LOG_LEVEL, PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const ENTITLEMENT_ID = 'rodeo_apps_premium';

export const initRevenueCat = () => {
  const appleKey = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY;
  const googleKey = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY;
  if (!appleKey && !googleKey) {
    console.warn('[IAP] RevenueCat keys not configured — purchase flows disabled');
    return;
  }
  Purchases.setLogLevel(LOG_LEVEL.WARN);
  if (Platform.OS === 'ios' && appleKey) {
    Purchases.configure({ apiKey: appleKey });
  } else if (Platform.OS === 'android' && googleKey) {
    Purchases.configure({ apiKey: googleKey });
  }
};

export const identifyUser = async (userId: string) => {
  try {
    await Purchases.logIn(userId);
  } catch {
    // ignore — RevenueCat not configured or offline
  }
};

// Read the active premium entitlement (and its expiry) out of a CustomerInfo.
const readEntitlement = (
  info: CustomerInfo,
): { isPremium: boolean; expiresAt: string | null } => {
  const ent = info.entitlements.active[ENTITLEMENT_ID];
  if (!ent) return { isPremium: false, expiresAt: null };
  // expirationDate is null for lifetime / non-expiring entitlements.
  return { isPremium: true, expiresAt: ent.expirationDate ?? null };
};

export const checkPremium = async (): Promise<boolean> => {
  try {
    const info = await Purchases.getCustomerInfo();
    return readEntitlement(info).isPremium;
  } catch {
    return false;
  }
};

/**
 * Reconcile the cached DB flag with the LIVE RevenueCat entitlement.
 *
 * Call this on every app launch. The DB value alone cannot be trusted: it is
 * set true on purchase, but a subscription can lapse, be cancelled or refunded
 * while the app is closed. RevenueCat's CustomerInfo is the source of truth for
 * the device, so we push it back into profiles.has_premium_access /
 * premium_expires_at. The webhook handles server-side revocation; this covers
 * the client and self-heals if a webhook was ever missed.
 *
 * Returns the reconciled premium state, or null if RevenueCat is unavailable
 * (offline / not configured) — in which case the caller keeps the cached value.
 */
export const syncEntitlements = async (): Promise<
  { isPremium: boolean; expiresAt: string | null } | null
> => {
  let state: { isPremium: boolean; expiresAt: string | null };
  try {
    const info = await Purchases.getCustomerInfo();
    state = readEntitlement(info);
  } catch {
    // RevenueCat offline / not configured — don't clobber the cached DB value.
    return null;
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return state;

    // Only overwrite premium_source when we can positively confirm premium, so
    // we never erase the origin of a manually-granted comp when reconciling.
    const update: Record<string, unknown> = {
      has_premium_access: state.isPremium,
      premium_expires_at: state.expiresAt,
    };
    if (state.isPremium) update.premium_source = 'revenuecat';

    await supabase.from('profiles').update(update).eq('id', user.id);
  } catch {
    // Network hiccup writing back — the returned state still lets the UI update.
  }
  return state;
};

export const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
};

export const purchasePackage = async (pkg: PurchasesPackage) => {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  const { isPremium, expiresAt } = readEntitlement(customerInfo);
  if (isPremium) {
    // Sync premium status to Supabase
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({
          has_premium_access: true,
          premium_source: 'revenuecat',
          premium_expires_at: expiresAt,
        })
        .eq('id', user.id);
    }
  }
  return isPremium;
};

export const restorePurchases = async (): Promise<boolean> => {
  try {
    const info = await Purchases.restorePurchases();
    const { isPremium, expiresAt } = readEntitlement(info);
    // Persist the restored state so the DB reflects reality immediately.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const update: Record<string, unknown> = {
        has_premium_access: isPremium,
        premium_expires_at: expiresAt,
      };
      if (isPremium) update.premium_source = 'revenuecat';
      await supabase.from('profiles').update(update).eq('id', user.id);
    }
    return isPremium;
  } catch {
    return false;
  }
};

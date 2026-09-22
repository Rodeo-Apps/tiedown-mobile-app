import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { identifyUser, syncEntitlements } from '@/services/iapService';

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  has_premium_access: boolean;
  premium_source: string | null;
  premium_expires_at: string | null;
  is_coach: boolean;
  school_id: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select(
        'id, full_name, avatar_url, has_premium_access, premium_source, premium_expires_at, is_coach, school_id',
      )
      .eq('id', userId)
      .single();
    if (!data) return;

    const profileData = data as Profile;
    setProfile(profileData);

    // Reconcile the cached premium flag with the LIVE RevenueCat entitlement.
    // The DB value alone is untrustworthy: it's set true on purchase but a
    // subscription can lapse / cancel / refund while the app is closed. This
    // runs on every launch and self-heals if a webhook was ever missed.
    identifyUser(userId);
    const live = await syncEntitlements();
    if (live) {
      // Belt-and-braces expiry check in case the entitlement is reported active
      // but its expiration has already passed.
      const expired =
        live.expiresAt !== null && new Date(live.expiresAt).getTime() <= Date.now();
      const reconciled = live.isPremium && !expired;
      if (
        reconciled !== profileData.has_premium_access ||
        (live.expiresAt ?? null) !== (profileData.premium_expires_at ?? null)
      ) {
        setProfile({
          ...profileData,
          has_premium_access: reconciled,
          premium_expires_at: live.expiresAt,
        });
      }
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    router.replace('/auth/login');
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

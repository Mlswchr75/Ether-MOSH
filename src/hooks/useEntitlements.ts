import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentsEnvironmentSafe } from "@/lib/stripe";
import { useAuth } from "./useAuth";
import { resolveEntitlementQuery } from "@/lib/entitlements";
import { createSupportReference } from "@/lib/supportReference";

// Provider-neutral environment gate. Matches what the payments webhook writes.
function getPaymentsEnvironment(): "live" | "sandbox" {
  return getPaymentsEnvironmentSafe();
}

// Accounts that always have full Supporter access (app owner / comp accounts).
// Keyed on email so it persists across logins and devices.
const OWNER_EMAILS = new Set<string>(["myleswhitcher@gmail.com"]);
function isOwnerEmail(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.has(email.trim().toLowerCase());
}

interface EntitlementsState {
  isSupporter: boolean;
  hasTipped: boolean;
  hasAnyPurchase: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useEntitlements(): EntitlementsState {
  const { user } = useAuth();
  const [isSupporter, setIsSupporter] = useState(false);
  const [hasTipped, setHasTipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setIsSupporter(false);
      setHasTipped(false);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    const env = getPaymentsEnvironment();
    const owner = isOwnerEmail(user.email);
    setError(null);
    try {
      const result = await supabase
        .from("entitlements")
        .select("product_id")
        .eq("user_id", user.id)
        .eq("environment", env);
      const access = resolveEntitlementQuery(result, owner);
      setIsSupporter(access.isSupporter);
      setHasTipped(access.hasTipped);
    } catch (cause) {
      const reference = createSupportReference("access");
      console.error(`[entitlements:${reference}] refresh failed`, cause);
      setIsSupporter(owner);
      setHasTipped(owner);
      setError(`Unable to refresh purchase status. Try again; if it continues, contact support with ${reference}.`);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: pick up webhook writes as they land after checkout
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`entitlements-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entitlements",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  return { isSupporter, hasTipped, hasAnyPurchase: isSupporter || hasTipped, loading, error, refresh: load };
}

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentsEnvironmentSafe } from "@/lib/stripe";
import { useAuth } from "./useAuth";

// Provider-neutral environment gate. Matches what the payments webhook writes.
function getPaymentsEnvironment(): "live" | "sandbox" {
  return getPaymentsEnvironmentSafe();
}
const FREE_FOR_ALL = false;



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
  refresh: () => Promise<void>;
}

export function useEntitlements(): EntitlementsState {
  const { user } = useAuth();
  const [isSupporter, setIsSupporter] = useState(false);
  const [hasTipped, setHasTipped] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // TEMP: payments setup in progress — treat everyone as a supporter.
    if (FREE_FOR_ALL) {
      setIsSupporter(true);
      setHasTipped(false);
      setLoading(false);
      return;
    }
    if (!user) {
      setIsSupporter(false);
      setHasTipped(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const env = getPaymentsEnvironment();
    const owner = isOwnerEmail(user.email);
    try {
      const { data } = await supabase
        .from("entitlements")
        .select("product_id")
        .eq("user_id", user.id)
        .eq("environment", env);
      const ids = new Set((data ?? []).map((r) => r.product_id));
      setIsSupporter(ids.has("mosh_supporter") || owner);
      setHasTipped(ids.has("mosh_tip") || owner);
    } catch {
      setIsSupporter(owner);
      setHasTipped(owner);
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

  return { isSupporter, hasTipped, hasAnyPurchase: isSupporter || hasTipped, loading, refresh: load };
}

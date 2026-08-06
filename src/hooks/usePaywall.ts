import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";

// Single switch controlling whether the paywall is actually enforced.
// "false" = everything unlocked for everyone.
const PAYMENTS_LIVE = import.meta.env.VITE_PAYMENTS_LIVE !== "false";

/**
 * Central paywall gate.
 *   - isSupporter: allowed to use gated features
 *   - require(feature): true if allowed; otherwise shows a nudge and returns false
 *   - purchase(): sends the user to the pricing page checkout (or /auth if signed out)
 */
export function usePaywall() {
  const { user } = useAuth();
  const { isSupporter: realIsSupporter } = useEntitlements();
  const navigate = useNavigate();

  const purchase = useCallback(() => {
    if (!user) {
      navigate("/auth?next=/pricing");
      return;
    }
    navigate("/pricing?unlock=1");
  }, [user, navigate]);

  // Pre-launch: gating disabled entirely.
  if (!PAYMENTS_LIVE) {
    return {
      isSupporter: true,
      require: (_feature: string) => true,
      purchase,
    };
  }

  const require = (feature: string) => {
    if (realIsSupporter) return true;
    toast(`${feature} — supporter unlock`, {
      description: "One-time $4.99. Keeps the rebellion fed.",
      action: { label: "Unlock", onClick: () => purchase() },
    });
    return false;
  };

  return { isSupporter: realIsSupporter, require, purchase };
}

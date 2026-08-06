import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Gate a route behind a signed-in session. While the initial session
 * hydrates we render nothing (rather than flashing the sign-in page for
 * users who are actually authenticated). Unauthenticated visitors are
 * redirected to /auth with a `next` param so they return here after login.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }
  return <>{children}</>;
}

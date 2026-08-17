import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/store/useStore";

/**
 * /forge — kept as a shortcut into the unified editor rather than its own
 * page. Forge, camera and upload are now one screen with a mode switch, so
 * this just sets the mode old links and bookmarks expected and hands off to
 * /edit; there's no separate forge page left to render.
 *
 * Uses an imperative navigate() inside one effect, not <Navigate>, so the
 * store update is guaranteed to land before the route change rather than
 * racing it.
 */
export default function ForgeRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const s = useStore.getState();
    if (s.sourceMode !== "forge") s.setSourceMode("forge");
    if (!s.forge.stack.length) s.randomiseForge();
    navigate("/edit", { replace: true });
  }, [navigate]);

  return null;
}

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useEntitlements } from "./useEntitlements";

import { useStore } from "@/store/useStore";
import type { Favorite } from "@/store/types";

/**
 * When a signed-in supporter is present, mirror local favorites to `saved_presets`
 * and hydrate any cloud-only favorites into local state on mount.
 * Free / signed-out users continue to use localStorage-only favorites unchanged.
 */
export function useCloudFavorites() {
  const { user } = useAuth();
  const { isSupporter } = useEntitlements();
  const enabled = !!user && isSupporter;

  const hydratedRef = useRef(false);
  const lastPushedRef = useRef<string>("");

  // Hydrate cloud → local once when supporter+signed-in
  useEffect(() => {
    if (!enabled || !user) {
      hydratedRef.current = false;
      return;
    }
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    (async () => {
      const { data, error } = await supabase
        .from("saved_presets")
        .select("id, name, params, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "favorite")
        .order("created_at", { ascending: true });
      if (error) return;
      const cloud: Favorite[] = (data ?? [])
        .map((r: any) => {
          const p = (r.params ?? {}) as Record<string, unknown>;
          return {
            ...p,
            id: r.id,
            name: r.name,
          } as unknown as Favorite;
        })
        .filter((f) => Array.isArray((f as any).layers));
      if (cloud.length === 0) return;
      // Merge into local state, preferring existing local entries by id.
      const state = useStore.getState();
      const existingIds = new Set(state.favorites.map((f) => f.id));
      const merged = [...state.favorites, ...cloud.filter((c) => !existingIds.has(c.id))];
      useStore.setState({ favorites: merged });
      try {
        localStorage.setItem("cathedral_favorites_v1", JSON.stringify(merged));
      } catch {
        /* noop */
      }
    })();
  }, [enabled, user]);

  // Push local → cloud whenever favorites change (supporter+signed-in only)
  useEffect(() => {
    if (!enabled || !user) return;
    return useStore.subscribe((state) => {
      const key = JSON.stringify(state.favorites.map((f) => `${f.id}:${f.name}:${f.layers.length}`));
      if (key === lastPushedRef.current) return;
      lastPushedRef.current = key;
      const rows = state.favorites.map((f) => ({
        id: f.id,
        user_id: user.id,
        name: f.name,
        source_type: "favorite",
        params: JSON.parse(JSON.stringify(f)),
      }));
      // Upsert; deletes handled by full replace strategy is fine at this scale.
      supabase.from("saved_presets").upsert(rows, { onConflict: "id" }).then(({ error }) => {
        if (error) console.warn("cloud favorites push failed", error.message);
      });
    });
  }, [enabled, user]);
}

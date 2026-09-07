import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { knownRadioTracks } from "@/lib/radioLinks";

export type RadioPlaylist = Database["public"]["Tables"]["radio_playlists"]["Row"];
export function useRadioLibrary() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const account = useRef(userId);
  account.current = userId;
  const [dataOwner, setDataOwner] = useState<string>();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<RadioPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const token = ++generation.current;
    if (!userId) { setFavorites([]); setPlaylists([]); setError(""); setLoading(false); return; }
    setLoading(true);
    try {
      const [f, p] = await Promise.all([
        supabase.from("radio_favorites").select("track_id").eq("user_id", userId),
        supabase.from("radio_playlists").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
      ]);
      if (f.error || p.error) throw f.error || p.error;
      if (account.current !== userId || token !== generation.current) return;
      setDataOwner(userId);
      setFavorites((f.data || []).map(row => row.track_id));
      setPlaylists(p.data || []);
      setError("");
    } catch {
      if (account.current === userId && token === generation.current) setError("Couldn’t load your saved music. Try again.");
    } finally { if (token === generation.current) setLoading(false); }
  }, [userId]);

  const cancelRefresh = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    setFavorites([]); setPlaylists([]); setError("");
    void refresh();
    const onFocus = () => { if (!lock.current) void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { cancelRefresh(); window.removeEventListener("focus", onFocus); };
  }, [refresh, cancelRefresh]);

  const mutate = async (operation: () => Promise<void>, message: string) => {
    if (!userId || lock.current) return false;
    lock.current = true; setBusy(true); generation.current++;
    try {
      await operation();
      if (account.current === userId) { toast.success(message); await refresh(); }
      return true;
    } catch {
      if (account.current === userId) toast.error("Couldn’t save that change. Please try again.");
      return false;
    } finally { lock.current = false; setBusy(false); }
  };

  const toggleFavorite = (trackId: string) => {
    const removing = favorites.includes(trackId);
    return mutate(async () => {
      const result = removing
        ? await supabase.from("radio_favorites").delete().eq("user_id", userId!).eq("track_id", trackId)
        : await supabase.from("radio_favorites").insert({ user_id: userId!, track_id: trackId });
      if (result.error && result.error.code !== "23505") throw result.error;
    }, removing ? "Removed from favorites" : "Added to favorites");
  };
  const savePlaylist = (name: string, ids: string[], id?: string) => {
    if (!name.trim() || name.trim().length > 80) return Promise.resolve(false);
    return mutate(async () => {
      const row = { name: name.trim(), track_ids: knownRadioTracks(ids).map(t => t.id), updated_at: new Date().toISOString() };
      const result = id
        ? await supabase.from("radio_playlists").update(row).eq("user_id", userId!).eq("id", id).select().single()
        : await supabase.from("radio_playlists").insert({ ...row, user_id: userId! }).select().single();
      if (result.error) throw result.error;
    }, id ? "Playlist updated" : "Playlist created");
  };
  const deletePlaylist = (id: string) => mutate(async () => {
    const result = await supabase.from("radio_playlists").delete().eq("user_id", userId!).eq("id", id).select().single();
    if (result.error) throw result.error;
  }, "Playlist deleted");
  return { user, favorites: dataOwner === userId ? favorites : [], playlists: dataOwner === userId ? playlists : [], loading: authLoading || loading, busy, error, refresh, toggleFavorite, savePlaylist, deletePlaylist };
}

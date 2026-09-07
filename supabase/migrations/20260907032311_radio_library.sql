-- Account-owned radio library. Shared links contain a catalog-only snapshot;
-- no public read policy is needed for favorites or private playlists.
create table public.radio_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null check (char_length(track_id) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create table public.radio_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  track_ids text[] not null default '{}' check (cardinality(track_ids) <= 100),
  updated_at timestamptz not null default now()
);
create index radio_playlists_user_updated on public.radio_playlists(user_id, updated_at desc);
alter table public.radio_favorites enable row level security;
alter table public.radio_playlists enable row level security;
revoke all on public.radio_favorites, public.radio_playlists from anon, authenticated;
grant select, insert, delete on public.radio_favorites to authenticated;
grant select, insert, update, delete on public.radio_playlists to authenticated;
create policy radio_favorites_read on public.radio_favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy radio_favorites_add on public.radio_favorites for insert to authenticated with check ((select auth.uid()) = user_id);
create policy radio_favorites_remove on public.radio_favorites for delete to authenticated using ((select auth.uid()) = user_id);
create policy radio_playlists_read on public.radio_playlists for select to authenticated using ((select auth.uid()) = user_id);
create policy radio_playlists_add on public.radio_playlists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy radio_playlists_edit on public.radio_playlists for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy radio_playlists_remove on public.radio_playlists for delete to authenticated using ((select auth.uid()) = user_id);

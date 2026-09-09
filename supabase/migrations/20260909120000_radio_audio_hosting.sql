-- Radio audio moves off the build.
--
-- Every song shipped inside the bundle until now: 31 files, ~106 MB in
-- public/audio, committed to the repo and served from the deploy. That works
-- for a handful and stops working well before the hundreds this library is
-- heading for — the repo carries the bytes forever, every deploy re-uploads
-- them, and adding a song needs a commit and a release.
--
-- Two buckets, because the two kinds of audio have opposite requirements:
--
--   radio-catalogue  public. The station's own library. Anyone can stream it,
--                    nobody but the owner can write it, and a new song is an
--                    upload plus a row rather than a deploy.
--   radio-uploads    private, one folder per user. A listener's own music.
--                    Never public, never listable by anyone else.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('radio-catalogue', 'radio-catalogue', true,  52428800,
   array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/flac','audio/webm']),
  ('radio-uploads',   'radio-uploads',   false, 52428800,
   array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/flac','audio/webm'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------
-- Replaces SHOWCASE_TRACKS as the list of what the station can play. Read by
-- everyone including signed-out listeners, which is the whole point of a
-- station; written only through the dashboard or the sync script.
create table public.radio_tracks (
  id text primary key check (char_length(id) between 1 and 100),
  storage_path text not null check (char_length(storage_path) between 1 and 400),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  artist text not null default 'MOSH' check (char_length(btrim(artist)) between 1 and 200),
  -- Station tags — /radio?station=<tag> filters the rotation on these.
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  -- Lower sorts first; ties fall back to title so the order is total.
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index radio_tracks_sort on public.radio_tracks(sort, title);

alter table public.radio_tracks enable row level security;
revoke all on public.radio_tracks from anon, authenticated;
grant select on public.radio_tracks to anon, authenticated;
create policy radio_tracks_read on public.radio_tracks for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- A listener's own uploads
-- ---------------------------------------------------------------------------
create table public.radio_user_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 1 and 400),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  bytes bigint check (bytes is null or bytes between 0 and 52428800),
  created_at timestamptz not null default now(),
  unique (user_id, storage_path)
);
create index radio_user_tracks_owner on public.radio_user_tracks(user_id, created_at desc);

alter table public.radio_user_tracks enable row level security;
revoke all on public.radio_user_tracks from anon, authenticated;
grant select, insert, delete on public.radio_user_tracks to authenticated;
create policy radio_user_tracks_read on public.radio_user_tracks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy radio_user_tracks_add on public.radio_user_tracks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy radio_user_tracks_remove on public.radio_user_tracks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Who may keep music here, and how much
-- ---------------------------------------------------------------------------
-- Keeping uploads across sessions is a supporter perk; playing one you just
-- picked is not, and never needs this (that path uses an object URL and never
-- reaches the server).
--
-- Deliberately not filtered on `environment`. The app filters by it so a
-- sandbox purchase doesn't read as a live one in the UI, but here the effect
-- of being wrong is a supporter losing their own library, which is worse than
-- a sandbox entitlement unlocking storage they still can only fill with their
-- own files, up to a cap.
create or replace function public.is_radio_supporter(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.product_id = 'mosh_supporter'
  );
$$;
revoke all on function public.is_radio_supporter(uuid) from public, anon;
grant execute on function public.is_radio_supporter(uuid) to authenticated;

-- "Within reason": a hundred songs each. Enforced in a trigger rather than a
-- CHECK because it counts sibling rows, and raised as a named error so the UI
-- can say which limit was hit instead of surfacing a bare policy denial.
create or replace function public.radio_user_tracks_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_radio_supporter(new.user_id) then
    raise exception 'radio_uploads_supporter_only'
      using hint = 'Saving uploads to your account is a supporter feature.';
  end if;
  if (select count(*) from public.radio_user_tracks where user_id = new.user_id) >= 100 then
    raise exception 'radio_uploads_limit_reached'
      using hint = 'You can keep up to 100 uploaded songs.';
  end if;
  return new;
end;
$$;
create trigger radio_user_tracks_guard_ins
  before insert on public.radio_user_tracks
  for each row execute function public.radio_user_tracks_guard();

-- ---------------------------------------------------------------------------
-- Storage access
-- ---------------------------------------------------------------------------
-- The catalogue bucket is public, so reads need no policy. Writes are the
-- owner's job through the dashboard or the service role, which bypasses RLS —
-- so there is deliberately no insert policy here at all.

-- Uploads: your own folder, and only your own. The first path segment is the
-- uploader's id, which is what makes one listener's music invisible to every
-- other one even though they share a bucket.
create policy radio_uploads_read on storage.objects
  for select to authenticated
  using (bucket_id = 'radio-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy radio_uploads_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'radio-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy radio_uploads_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'radio-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

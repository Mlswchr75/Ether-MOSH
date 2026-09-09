-- Two fixes the security advisor caught on the migration before this one.
--
-- `is_radio_supporter` was a second answer to a question `has_supporter`
-- already answers, and a worse one. The existing function refuses to report on
-- anyone but the caller —
--
--     WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid()
--       THEN false
--
-- — so it cannot be used to probe whether some other account is a supporter,
-- which mine could have been. It also honours the owner-email override, which
-- mine did not, so the owner would have been refused their own uploads.
--
-- And the trigger function was reachable at /rest/v1/rpc/radio_user_tracks_guard
-- by anon and authenticated alike. Nothing should call a trigger body directly.
create or replace function public.radio_user_tracks_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_supporter(new.user_id, 'live') then
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

revoke all on function public.radio_user_tracks_guard() from public, anon, authenticated;

drop function if exists public.is_radio_supporter(uuid);

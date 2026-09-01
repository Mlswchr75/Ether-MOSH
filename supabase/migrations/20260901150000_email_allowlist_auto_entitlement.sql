-- Emails granted automatic supporter access ("comp" accounts) — checked on
-- new-user signup so the grant happens transparently the moment someone
-- signs in for the first time, no payment involved.
--
-- Managed via Supabase Studio's Table Editor (Database > granted_emails,
-- or query it directly) — add a row, and the NEXT new signup matching that
-- email gets granted automatically. For an email that already has an
-- account, add the row and then ask for (or run) a one-off backfill INSERT
-- into entitlements, since this trigger only fires on brand-new signups.
--
-- Locked down by RLS with zero policies: invisible to every client-side
-- query (authenticated or anon, including the account holder themself) —
-- only service_role and this migration's own SECURITY DEFINER trigger
-- function can ever read or write it.
CREATE TABLE public.granted_emails (
  email text PRIMARY KEY,
  product_id text NOT NULL DEFAULT 'mosh_supporter',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.granted_emails ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.granted_emails TO service_role;

-- Extends the existing new-user trigger (handle_new_user, defined in
-- 20260717124626) rather than adding a second one — profile creation and
-- the allowlist check should happen atomically in the same transaction as
-- the signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  grant_row public.granted_emails%ROWTYPE;
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO grant_row FROM public.granted_emails WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF FOUND THEN
    -- Grants both environments: live for real use on the deployed site,
    -- sandbox so the same account also unlocks against a local/dev build
    -- pointed at Stripe test mode. transaction_id is synthesized (no real
    -- Stripe transaction backs a comp grant) but deterministic per
    -- user+environment, so re-running this trigger logic for the same user
    -- (it can't — AFTER INSERT fires once per row — but future manual
    -- backfills using the same scheme will) stays idempotent against the
    -- (transaction_id, product_id) uniqueness constraint.
    INSERT INTO public.entitlements (user_id, product_id, transaction_id, environment)
    VALUES
      (NEW.id, grant_row.product_id, 'comp_' || NEW.id::text || '_live', 'live'),
      (NEW.id, grant_row.product_id, 'comp_' || NEW.id::text || '_sandbox', 'sandbox')
    ON CONFLICT (transaction_id, product_id) DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

-- Tips are intentionally repeatable, so uniqueness cannot be global per
-- user/product/environment. Keep webhook event products idempotent by
-- transaction_id + product_id and prevent duplicate supporter grants only.
DROP INDEX IF EXISTS public.entitlements_user_product_env_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS entitlements_supporter_user_env_uniq
  ON public.entitlements(user_id, environment)
  WHERE product_id = 'mosh_supporter';

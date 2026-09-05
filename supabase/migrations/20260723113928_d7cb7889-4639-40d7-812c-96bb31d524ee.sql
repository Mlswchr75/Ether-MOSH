ALTER TABLE public.entitlements ALTER COLUMN paddle_transaction_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_user_product_env_uniq
  ON public.entitlements(user_id, product_id, environment);
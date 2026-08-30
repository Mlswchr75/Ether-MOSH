-- The original REVOKE ... FROM PUBLIC on these SECURITY DEFINER queue
-- wrappers (20260809011252_email_infra.sql) doesn't actually stop anon/
-- authenticated callers: Supabase grants those roles EXECUTE on every new
-- function in the public schema by default, as a role-specific grant
-- separate from PUBLIC's. Confirmed via Supabase's advisor lints
-- (anon_security_definer_function_executable /
-- authenticated_security_definer_function_executable) after applying this
-- schema to a fresh project: enqueue_email, read_email_batch, delete_email,
-- and move_to_dlq were all still callable by anyone with the anon key,
-- letting any client read/drain/forge entries in the email queues.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;

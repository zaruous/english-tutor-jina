ALTER TABLE public.conversation_sessions DROP COLUMN IF EXISTS provider_ref_provider;
UPDATE public.conversation_sessions SET provider_ref = NULL;

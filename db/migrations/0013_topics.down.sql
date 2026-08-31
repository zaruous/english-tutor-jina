ALTER TABLE public.conversation_sessions DROP COLUMN IF EXISTS scenario_id;
DROP TABLE IF EXISTS public.topic_contents;
DROP TABLE IF EXISTS public.vocab_sets;
DROP TABLE IF EXISTS public.conversation_scenarios;
DROP TABLE IF EXISTS public.topics;


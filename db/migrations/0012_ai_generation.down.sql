DROP TABLE IF EXISTS public.lesson_reports;
DROP TABLE IF EXISTS public.lesson_drafts;
DROP TABLE IF EXISTS public.ai_jobs;
ALTER TABLE public.lesson_items DROP COLUMN IF EXISTS skill_code;
ALTER TABLE public.lessons DROP COLUMN IF EXISTS visibility;
ALTER TABLE public.lessons DROP COLUMN IF EXISTS source;


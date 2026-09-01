-- 0015 롤백 — LC 시드 제거 후 kind 제약을 0005 상태로 되돌린다.
DELETE FROM public.lessons WHERE slug IN ('toeic-lc-short-conversation-1', 'toeic-lc-short-talk-1');
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_kind_ck;
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_kind_ck CHECK (kind IN ('toeic_part5', 'toeic_part7'));

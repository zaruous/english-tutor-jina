-- 0015_listening_lc.sql — 리스닝(LC) 콘텐츠 (플랜 08 Phase B)
-- 새 엔진 없음: lessons.kind 에 'toeic_lc' 를 허용하고 기존 레슨 테이블에 대화 세트를 넣는다.
-- 스크립트는 passage.body(화자 라벨 M:/W: 대화 줄 배열)에 저장한다 — v1 '연습 모드'는 클라이언트
-- TTS(jinaSpeak)로 읽으므로 스크립트가 브라우저에 오는 것을 전제로 하고, 화면이 제출 전까지
-- 렌더하지 않는 수준만 보장한다(플랜 08 §2.3). 시험 모드(서버 TTS·완전 비노출)는 후속.
-- 0005 는 적용된 파일이라 수정 금지 — CHECK 제약을 여기서 교체한다.

ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_kind_ck;
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_kind_ck CHECK (kind IN ('toeic_part5', 'toeic_part7', 'toeic_lc'));

INSERT INTO public.lessons
  (slug, kind, title, subtitle, difficulty, est_minutes, passage, vocab, faq,
   position, published, source, visibility)
VALUES
  ('toeic-lc-short-conversation-1', 'toeic_lc', 'TOEIC LC — 짧은 대화 · Set 1',
   '회의 일정 조율', 3, 4,
   '{"type":"LISTENING","subject":"Short Conversation","body":[
      "W: Do you have a minute? I''d like to move our weekly team meeting.",
      "M: Sure. Is Tuesday afternoon still a problem for you?",
      "W: It is. I have a client call that always runs long, so I keep joining late.",
      "M: Then let''s try Wednesday morning. Most people are in the office by nine.",
      "W: That works for me. Could you send the updated agenda to everyone?",
      "M: I''ll do that this afternoon, right after I confirm the room."]}'::jsonb,
   '[]'::jsonb,
   '["이 대화의 핵심 표현을 정리해 주세요","move a meeting 과 reschedule 의 차이를 알려 주세요"]'::jsonb,
   201, true, 'seed', 'public'),
  ('toeic-lc-short-talk-1', 'toeic_lc', 'TOEIC LC — 짧은 설명문 · Set 2',
   '사내 공지 · 시스템 점검', 3, 4,
   '{"type":"LISTENING","subject":"Short Talk","body":[
      "M: Good morning, everyone. This is a brief announcement from the IT department.",
      "M: Our expense reporting system will be unavailable this Saturday from eight a.m. to two p.m.",
      "M: During that window, please submit any urgent receipts by email instead.",
      "M: We expect the upgrade to make approvals about thirty percent faster.",
      "M: If you have questions, the help desk will be staffed as usual on Monday."]}'::jsonb,
   '[]'::jsonb,
   '["공지에서 시간 표현을 다시 짚어 주세요","이 안내를 이메일로 바꿔 써 주세요"]'::jsonb,
   202, true, 'seed', 'public')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, passage = EXCLUDED.passage,
  faq = EXCLUDED.faq, published = true, source = 'seed', visibility = 'public', updated_at = now();

INSERT INTO public.lesson_items (lesson_id, position, stem, options, answer, explanation, skill_code)
SELECT l.id, v.position, v.stem, v.options::jsonb, v.answer, v.explanation, v.skill_code
FROM (VALUES
  ('toeic-lc-short-conversation-1', 1,
   'What are the speakers mainly discussing?',
   '[{"id":"A","text":"A product launch delay"},{"id":"B","text":"Rescheduling a weekly meeting"},{"id":"C","text":"Hiring a new team member"},{"id":"D","text":"Booking a conference room"}]',
   'B', '여자가 "I''d like to move our weekly team meeting"이라고 말하며 주간 회의 시간을 옮기자고 제안합니다. (B)가 정답.', 'main_idea'),
  ('toeic-lc-short-conversation-1', 2,
   'What does the woman ask the man to do?',
   '[{"id":"A","text":"Send the updated agenda"},{"id":"B","text":"Contact the client directly"},{"id":"C","text":"Reserve a larger room"},{"id":"D","text":"Prepare the quarterly report"}]',
   'A', '여자가 "Could you send the updated agenda to everyone?"이라고 요청합니다. (A)가 정답.', 'detail'),
  ('toeic-lc-short-conversation-1', 3,
   'When will the meeting most likely take place?',
   '[{"id":"A","text":"Monday morning"},{"id":"B","text":"Tuesday afternoon"},{"id":"C","text":"Wednesday morning"},{"id":"D","text":"Friday afternoon"}]',
   'C', '남자가 "let''s try Wednesday morning"을 제안하고 여자가 "That works for me"로 동의합니다. (C)가 정답.', 'inference'),
  ('toeic-lc-short-talk-1', 1,
   'What is the purpose of the announcement?',
   '[{"id":"A","text":"To introduce a new employee"},{"id":"B","text":"To announce scheduled system maintenance"},{"id":"C","text":"To change a reimbursement policy"},{"id":"D","text":"To remind staff about a deadline"}]',
   'B', '"Our expense reporting system will be unavailable this Saturday"로 점검 안내임을 밝힙니다. (B)가 정답.', 'main_idea'),
  ('toeic-lc-short-talk-1', 2,
   'What are listeners asked to do during the downtime?',
   '[{"id":"A","text":"Email urgent receipts"},{"id":"B","text":"Visit the help desk in person"},{"id":"C","text":"Postpone all expense reports"},{"id":"D","text":"Use a backup website"}]',
   'A', '"please submit any urgent receipts by email instead"라고 안내합니다. (A)가 정답.', 'detail'),
  ('toeic-lc-short-talk-1', 3,
   'What benefit does the speaker mention?',
   '[{"id":"A","text":"Lower software costs"},{"id":"B","text":"Faster approvals"},{"id":"C","text":"More storage space"},{"id":"D","text":"Longer help desk hours"}]',
   'B', '"make approvals about thirty percent faster"로 승인 속도 향상을 언급합니다. (B)가 정답.', 'detail')
) AS v(slug, position, stem, options, answer, explanation, skill_code)
JOIN public.lessons l ON l.slug = v.slug
ON CONFLICT (lesson_id, position) DO UPDATE SET
  stem = EXCLUDED.stem, options = EXCLUDED.options, answer = EXCLUDED.answer,
  explanation = EXCLUDED.explanation, skill_code = EXCLUDED.skill_code;

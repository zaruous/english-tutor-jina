-- 0014_business_interview_topic.sql — Phase 3 공개 토픽의 최소 완성 단위
-- UI 노출 임계치(레슨 3 · 시나리오 1 · 단어 20)를 실제 콘텐츠로 충족한다.

INSERT INTO public.topics (slug, label_ko, description, visibility)
VALUES ('business-interview', '비즈니스 면접', '영문 면접의 핵심 어휘와 문법, 답변 연습을 한 흐름으로 학습합니다.', 'public')
ON CONFLICT (slug) DO UPDATE
  SET label_ko = EXCLUDED.label_ko, description = EXCLUDED.description, updated_at = now();

INSERT INTO public.lessons
  (slug, kind, title, subtitle, difficulty, est_minutes, passage, vocab, faq,
   position, published, source, visibility)
VALUES
  ('business-interview-part5-grammar', 'toeic_part5', 'TOEIC Part 5 — 면접 문법',
   '비즈니스 면접 · 동사와 시제', 3, 5,
   '{"type":"PART 5","subject":"Incomplete Sentences","body":["Choose the word or phrase that best completes each sentence."]}'::jsonb,
   '[]'::jsonb, '["왜 이 시제가 필요한가요?","면접에서 비슷한 문장을 만들어 주세요"]'::jsonb,
   101, true, 'seed', 'public'),
  ('business-interview-part5-vocabulary', 'toeic_part5', 'TOEIC Part 5 — 면접 어휘',
   '비즈니스 면접 · 역량과 성과', 3, 5,
   '{"type":"PART 5","subject":"Incomplete Sentences","body":["Choose the word or phrase that best completes each sentence."]}'::jsonb,
   '[]'::jsonb, '["정답 단어의 뉘앙스를 설명해 주세요","면접 답변에 이 표현을 써 주세요"]'::jsonb,
   102, true, 'seed', 'public'),
  ('business-interview-part5-situations', 'toeic_part5', 'TOEIC Part 5 — 면접 상황',
   '비즈니스 면접 · 협업과 문제 해결', 4, 6,
   '{"type":"PART 5","subject":"Incomplete Sentences","body":["Choose the word or phrase that best completes each sentence."]}'::jsonb,
   '[]'::jsonb, '["오답이 어색한 이유도 알려 주세요","이 문장을 자연스러운 면접 답변으로 확장해 주세요"]'::jsonb,
   103, true, 'seed', 'public')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, passage = EXCLUDED.passage,
  faq = EXCLUDED.faq, published = true, source = 'seed', visibility = 'public', updated_at = now();

INSERT INTO public.lesson_items (lesson_id, position, stem, options, answer, explanation, skill_code)
SELECT l.id, v.position, v.stem, v.options::jsonb, v.answer, v.explanation, v.skill_code
FROM (VALUES
  ('business-interview-part5-grammar', 1,
   'Ms. Rivera has _____ three cross-functional projects since joining the company.',
   '[{"id":"A","text":"lead"},{"id":"B","text":"led"},{"id":"C","text":"leading"},{"id":"D","text":"leads"}]',
   'B', '(B) led가 현재완료 has 뒤의 과거분사 형태이므로 정답입니다.', 'grammar'),
  ('business-interview-part5-grammar', 2,
   'The hiring manager asked whether the candidate _____ available to start in September.',
   '[{"id":"A","text":"is"},{"id":"B","text":"was"},{"id":"C","text":"will"},{"id":"D","text":"has"}]',
   'B', '(B) was는 과거 동사 asked에 이어지는 간접의문문의 자연스러운 시제입니다.', 'grammar'),
  ('business-interview-part5-grammar', 3,
   'Applicants are encouraged _____ specific examples of measurable results.',
   '[{"id":"A","text":"provide"},{"id":"B","text":"provided"},{"id":"C","text":"to provide"},{"id":"D","text":"providing"}]',
   'C', '(C) to provide가 encourage 목적격 보어의 수동형 be encouraged to do 구조를 완성합니다.', 'grammar'),
  ('business-interview-part5-vocabulary', 1,
   'Her ability to resolve customer complaints demonstrates strong problem-solving _____.',
   '[{"id":"A","text":"competency"},{"id":"B","text":"vacancy"},{"id":"C","text":"attendance"},{"id":"D","text":"inventory"}]',
   'A', '(A) competency는 업무를 수행하는 역량을 뜻해 문맥에 가장 알맞습니다.', 'vocab'),
  ('business-interview-part5-vocabulary', 2,
   'The candidate _____ a 15 percent reduction in operating costs at his previous company.',
   '[{"id":"A","text":"achieved"},{"id":"B","text":"attended"},{"id":"C","text":"assumed"},{"id":"D","text":"attached"}]',
   'A', '(A) achieved는 구체적인 성과나 결과를 달성했다는 의미입니다.', 'vocab'),
  ('business-interview-part5-vocabulary', 3,
   'Please describe a situation in which you took the _____ to improve a process.',
   '[{"id":"A","text":"initiative"},{"id":"B","text":"reservation"},{"id":"C","text":"permission"},{"id":"D","text":"occupation"}]',
   'A', '(A) initiative는 지시를 기다리지 않고 주도적으로 행동하는 태도를 뜻합니다.', 'vocab'),
  ('business-interview-part5-situations', 1,
   'When priorities changed unexpectedly, the team quickly _____ its project schedule.',
   '[{"id":"A","text":"adapted"},{"id":"B","text":"adapted to"},{"id":"C","text":"adapting"},{"id":"D","text":"adaptation"}]',
   'B', '(B) adapted to가 목적어 its project schedule과 함께 쓰이는 올바른 표현입니다.', 'grammar'),
  ('business-interview-part5-situations', 2,
   'A strong answer should explain the action taken _____ the result that followed.',
   '[{"id":"A","text":"but"},{"id":"B","text":"nor"},{"id":"C","text":"and"},{"id":"D","text":"unless"}]',
   'C', '(C) and가 action과 result라는 두 요소를 자연스럽게 연결합니다.', 'detail'),
  ('business-interview-part5-situations', 3,
   'Interviewers often value candidates who can remain _____ under pressure.',
   '[{"id":"A","text":"compose"},{"id":"B","text":"composure"},{"id":"C","text":"composed"},{"id":"D","text":"composing"}]',
   'C', '(C) composed는 remain 뒤에서 주어의 침착한 상태를 설명하는 형용사입니다.', 'vocab')
) AS v(slug, position, stem, options, answer, explanation, skill_code)
JOIN public.lessons l ON l.slug = v.slug
ON CONFLICT (lesson_id, position) DO UPDATE SET
  stem = EXCLUDED.stem, options = EXCLUDED.options, answer = EXCLUDED.answer,
  explanation = EXCLUDED.explanation, skill_code = EXCLUDED.skill_code;

INSERT INTO public.conversation_scenarios
  (slug, title, tag, level, description, system_prompt, opening_message, objectives, source, visibility)
VALUES (
  'business-interview-star', 'STAR 방식 영문 면접', 'BUSINESS INTERVIEW', 3,
  '행동 면접 질문에 상황·과제·행동·결과 순서로 답하는 연습입니다.',
  'You are a supportive English interviewer. Ask one behavioral interview question at a time and coach the learner to answer with the STAR framework.',
  'Tell me about a time you solved a difficult problem at work.',
  '["STAR 구조로 60초 답변하기","성과를 수치로 설명하기","후속 질문에 자연스럽게 답하기"]'::jsonb,
  'seed', 'public'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt, opening_message = EXCLUDED.opening_message,
  objectives = EXCLUDED.objectives, source = 'seed', visibility = 'public', updated_at = now();

INSERT INTO public.vocab_sets (slug, title, description, words, source, visibility)
VALUES (
  'business-interview-core-20', '비즈니스 면접 핵심 20단어',
  '역량·성과·협업·문제 해결을 설명할 때 자주 쓰는 표현입니다.',
  '[
    {"word":"accomplishment","pos":"n.","meaning_ko":"성과, 업적"},
    {"word":"adaptability","pos":"n.","meaning_ko":"적응력"},
    {"word":"collaborate","pos":"v.","meaning_ko":"협업하다"},
    {"word":"competency","pos":"n.","meaning_ko":"역량"},
    {"word":"deadline","pos":"n.","meaning_ko":"마감 기한"},
    {"word":"delegate","pos":"v.","meaning_ko":"위임하다"},
    {"word":"demonstrate","pos":"v.","meaning_ko":"입증하다, 보여 주다"},
    {"word":"initiative","pos":"n.","meaning_ko":"주도성"},
    {"word":"leadership","pos":"n.","meaning_ko":"리더십"},
    {"word":"measurable","pos":"adj.","meaning_ko":"측정 가능한"},
    {"word":"negotiate","pos":"v.","meaning_ko":"협상하다"},
    {"word":"prioritize","pos":"v.","meaning_ko":"우선순위를 정하다"},
    {"word":"proactive","pos":"adj.","meaning_ko":"선제적인"},
    {"word":"productive","pos":"adj.","meaning_ko":"생산적인"},
    {"word":"resolve","pos":"v.","meaning_ko":"해결하다"},
    {"word":"responsibility","pos":"n.","meaning_ko":"책임"},
    {"word":"stakeholder","pos":"n.","meaning_ko":"이해관계자"},
    {"word":"streamline","pos":"v.","meaning_ko":"효율화하다"},
    {"word":"strength","pos":"n.","meaning_ko":"강점"},
    {"word":"workload","pos":"n.","meaning_ko":"업무량"}
  ]'::jsonb,
  'seed', 'public'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, words = EXCLUDED.words,
  source = 'seed', visibility = 'public', updated_at = now();

INSERT INTO public.topic_contents (topic_id, lesson_id, position)
SELECT t.id, l.id, row_number() OVER (ORDER BY l.position)::int
  FROM public.topics t
  JOIN public.lessons l ON l.slug IN (
    'business-interview-part5-grammar',
    'business-interview-part5-vocabulary',
    'business-interview-part5-situations'
  )
 WHERE t.slug = 'business-interview'
   AND NOT EXISTS (
     SELECT 1 FROM public.topic_contents tc WHERE tc.topic_id = t.id AND tc.lesson_id = l.id
   );

INSERT INTO public.topic_contents (topic_id, scenario_id, position)
SELECT t.id, s.id, 10
  FROM public.topics t
  JOIN public.conversation_scenarios s ON s.slug = 'business-interview-star'
 WHERE t.slug = 'business-interview'
   AND NOT EXISTS (
     SELECT 1 FROM public.topic_contents tc WHERE tc.topic_id = t.id AND tc.scenario_id = s.id
   );

INSERT INTO public.topic_contents (topic_id, vocab_set_id, position)
SELECT t.id, v.id, 20
  FROM public.topics t
  JOIN public.vocab_sets v ON v.slug = 'business-interview-core-20'
 WHERE t.slug = 'business-interview'
   AND NOT EXISTS (
     SELECT 1 FROM public.topic_contents tc WHERE tc.topic_id = t.id AND tc.vocab_set_id = v.id
   );


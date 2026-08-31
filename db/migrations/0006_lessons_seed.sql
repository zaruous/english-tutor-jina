-- 0006_lessons_seed.sql — TOEIC 학습 콘텐츠 이관 (lesson.jsx LESSON_DATA/LESSON_DATA_2)
-- 사용자 무관 참조 데이터이므로 마이그레이션으로 (0003_vocab_words_seed와 동일 규범).
-- 멱등: ON CONFLICT DO NOTHING. JSONB 본문은 $json$ 달러 인용 (러너가 문을 분할하지 않는다).
-- ★ set24 해설은 mock에 존재하지 않았다(해설 버그의 원인) — 계획서 신규 텍스트를 사용.

INSERT INTO public.lessons (slug, kind, title, subtitle, difficulty, est_minutes, passage, vocab, faq, position)
VALUES
('toeic-part7-set23', 'toeic_part7', 'TOEIC Part 7 — 단일 지문', 'Set 23 · 비즈니스 이메일', 3, 6,
 $json$ {"type":"EMAIL","from":"Daniel Park <d.park@meridian-co.com>","to":"All Marketing Team",
   "cc":"Hannah Lee, J. Whitmore","date":"Tuesday, May 26 · 09:14",
   "subject":"Q3 Campaign Kickoff — Action Items",
   "body":["Dear team,",
     "Thank you all for the productive workshop yesterday. As discussed, we will be moving forward with the \"Bright Mornings\" campaign as our Q3 priority. Below is a summary of the immediate next steps:",
     "1. Hannah will finalize the creative brief by Friday, May 29.",
     "2. James, please coordinate with the external agency to confirm the photo-shoot schedule. We are aiming for the week of June 8.",
     "3. The media buy budget has been approved at $48,000 — a 12% increase from Q2.",
     "I would also like to remind everyone that **the launch date has been moved up by one week** to accommodate the regional sales conference. Please update your project plans accordingly.",
     "If you anticipate any blockers, please reach out to me directly before Thursday's stand-up. I appreciate your continued effort and flexibility.",
     "Best regards,",
     "Daniel Park · Marketing Director"]} $json$::jsonb,
 $json$ [{"word":"accommodate","ipa":"/əˈkɑːmədeɪt/","pos":"v.","meaning":"~을 수용하다, 맞추다","ex":"to accommodate the schedule"},
   {"word":"anticipate","ipa":"/ænˈtɪsɪpeɪt/","pos":"v.","meaning":"예상하다, 미리 대비하다","ex":"anticipate any blockers"},
   {"word":"finalize","ipa":"/ˈfaɪnəlaɪz/","pos":"v.","meaning":"최종 확정하다","ex":"finalize the brief by Friday"}] $json$::jsonb,
 $json$ ["\"moved up by one week\"을 한국어로 풀어주세요","이 이메일의 어조(tone)는 어떤가요?",
   "Daniel Park이 가장 강조한 메시지는 무엇인가요?","\"accommodate\"가 비즈니스에서 쓰이는 다른 예시는?"] $json$::jsonb,
 1),
('toeic-part7-set24', 'toeic_part7', 'TOEIC Part 7 — 단일 지문', 'Set 24 · 공지 및 안내문', 3, 6,
 $json$ {"type":"NOTICE","from":"Facilities Management","to":"All Staff",
   "cc":"","date":"Wednesday, May 27 · 08:00",
   "subject":"Building Maintenance — Elevator Out of Service (May 28–29)",
   "body":["Dear colleagues,",
     "Please be advised that **Elevator B in the North Tower will be taken out of service from Thursday, May 28 (7:00 AM) through Friday, May 29 (6:00 PM)** for scheduled hydraulic maintenance.",
     "During this period, Elevator A and the stairwells on both the East and West sides of the building will remain fully operational. We ask all staff to plan accordingly and allow extra travel time between floors.",
     "Employees who require mobility assistance are requested to contact Facilities Management at ext. 4400 by Wednesday afternoon so that appropriate arrangements can be made.",
     "The maintenance is expected to be completed by Friday evening. However, if additional work is required, we will provide an updated timeline no later than Friday at noon.",
     "We apologize for the inconvenience and appreciate your patience and cooperation.",
     "Facilities Management Team"]} $json$::jsonb,
 $json$ [{"word":"operational","ipa":"/ˌɒpəˈreɪʃənəl/","pos":"adj.","meaning":"운용 가능한, 작동 중인","ex":"remain fully operational"},
   {"word":"hydraulic","ipa":"/haɪˈdrɔːlɪk/","pos":"adj.","meaning":"유압의, 수압을 이용한","ex":"hydraulic maintenance"},
   {"word":"mobility","ipa":"/moʊˈbɪlɪti/","pos":"n.","meaning":"이동성, 운동 능력","ex":"require mobility assistance"}] $json$::jsonb,
 $json$ ["\"no later than\"은 어떤 뉘앙스인가요?","이 공지에서 직원이 해야 할 일을 정리해주세요",
   "\"operational\"이 비즈니스에서 쓰이는 다른 예시는?"] $json$::jsonb,
 2)
ON CONFLICT (slug) DO NOTHING;

-- Set 23 문항 (mock의 options[].correct → answer 컬럼, 하드코딩 해설 → explanation)
INSERT INTO public.lesson_items (lesson_id, position, stem, options, answer, explanation)
SELECT l.id, v.position, v.stem, v.options::jsonb, v.answer, v.explanation
  FROM (VALUES
    (1, 'What is the main purpose of the email?',
     $json$[{"id":"A","text":"To announce a new hire in the marketing team"},{"id":"B","text":"To outline next steps for an upcoming campaign"},{"id":"C","text":"To request approval for a budget increase"},{"id":"D","text":"To reschedule a regional sales conference"}]$json$,
     'B', '이메일 첫 문단의 "moving forward with the campaign as our Q3 priority"와 본문 1-3번 액션 아이템이 핵심 단서예요. 캠페인의 다음 단계를 정리한 이메일이에요.'),
    (2, 'According to the email, what is true about the launch date?',
     $json$[{"id":"A","text":"It has been postponed by one week"},{"id":"B","text":"It is scheduled for the week of June 8"},{"id":"C","text":"It has been moved one week earlier"},{"id":"D","text":"It will be decided during Thursday's stand-up"}]$json$,
     'C', '"the launch date has been moved up by one week"의 move up은 "앞당기다"라는 뜻이에요. (C) one week earlier가 정답.'),
    (3, 'The word "blockers" in paragraph 5 is closest in meaning to —',
     $json$[{"id":"A","text":"budget cuts"},{"id":"B","text":"obstacles"},{"id":"C","text":"colleagues"},{"id":"D","text":"deliverables"}]$json$,
     'B', 'blockers는 IT/비즈니스 영어에서 "진행을 가로막는 장애물"을 뜻해요. 가장 가까운 동의어는 obstacles.')
  ) AS v(position, stem, options, answer, explanation)
  JOIN public.lessons l ON l.slug = 'toeic-part7-set23'
ON CONFLICT (lesson_id, position) DO NOTHING;

-- Set 24 문항 — 해설은 신규 (mock에는 set24 해설이 없었다)
INSERT INTO public.lesson_items (lesson_id, position, stem, options, answer, explanation)
SELECT l.id, v.position, v.stem, v.options::jsonb, v.answer, v.explanation
  FROM (VALUES
    (1, 'What is the purpose of this notice?',
     $json$[{"id":"A","text":"To announce the construction of a new elevator"},{"id":"B","text":"To inform staff about temporary elevator unavailability"},{"id":"C","text":"To request volunteers for building maintenance"},{"id":"D","text":"To introduce new building safety procedures"}]$json$,
     'B', '공지 제목과 첫 문단 "Elevator B … will be taken out of service"가 핵심 단서예요. 엘리베이터의 임시 운행 중단을 알리는 공지예요.'),
    (2, 'According to the notice, what should employees needing assistance do?',
     $json$[{"id":"A","text":"Use the stairwells on the West side only"},{"id":"B","text":"Email the Facilities Management team"},{"id":"C","text":"Call extension 4400 by Wednesday afternoon"},{"id":"D","text":"Wait for further instructions on Friday noon"}]$json$,
     'C', '"contact Facilities Management at ext. 4400 by Wednesday afternoon"이 그대로 답이에요. 이메일이 아니라 내선 4400으로 전화, 기한은 수요일 오후.'),
    (3, 'When will the updated timeline be provided IF additional work is needed?',
     $json$[{"id":"A","text":"By Thursday morning"},{"id":"B","text":"By Friday at noon"},{"id":"C","text":"By Friday at 6:00 PM"},{"id":"D","text":"By the following Monday"}]$json$,
     'B', '"we will provide an updated timeline no later than Friday at noon" — no later than은 "늦어도 ~까지"라는 뜻이에요. (B) By Friday at noon이 정답.')
  ) AS v(position, stem, options, answer, explanation)
  JOIN public.lessons l ON l.slug = 'toeic-part7-set24'
ON CONFLICT (lesson_id, position) DO NOTHING;

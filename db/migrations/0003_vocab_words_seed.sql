-- 참조 데이터: 사전 항목 8단어 (src/screens/vocabulary.jsx INITIAL_VOCAB 에서 이관)
-- 사용자 무관 공유 사전 데이터. 재실행 안전(ON CONFLICT DO NOTHING).
INSERT INTO public.vocab_words (word, pos, ipa, meaning_ko, examples, difficulty, source) VALUES
  ('accommodate', 'v.', '/əˈkɒmədeɪt/', '수용하다, 맞추다',
   '["The schedule was changed to accommodate the regional conference.", "We can accommodate up to 200 guests in the main hall."]'::jsonb, 3, 'seed'),
  ('facilitate', 'v.', '/fəˈsɪlɪteɪt/', '촉진하다, 용이하게 하다',
   '["The new system will facilitate communication between departments.", "Our goal is to facilitate a smooth transition."]'::jsonb, 3, 'seed'),
  ('procurement', 'n.', '/prəˈkjʊərmənt/', '조달, 구매',
   '["The procurement department handles all supplier contracts.", "Procurement costs increased by 8% this quarter."]'::jsonb, 4, 'seed'),
  ('discrepancy', 'n.', '/dɪˈskrepənsi/', '불일치, 차이',
   '["There is a discrepancy between the invoice and the purchase order.", "Please investigate the discrepancy in the report figures."]'::jsonb, 4, 'seed'),
  ('reimburse', 'v.', '/ˌriːɪmˈbɜːrs/', '환급하다, 변제하다',
   '["The company will reimburse all travel expenses within 30 days.", "Please submit your receipts to be reimbursed."]'::jsonb, 3, 'seed'),
  ('compliance', 'n.', '/kəmˈplaɪəns/', '준수, 규정 이행',
   '["All employees must complete the annual compliance training.", "The audit confirmed full compliance with safety regulations."]'::jsonb, 3, 'seed'),
  ('scrutinize', 'v.', '/ˈskruːtɪnaɪz/', '면밀히 검토하다, 조사하다',
   '["The committee will scrutinize the proposed budget carefully.", "Analysts scrutinized the quarterly earnings report."]'::jsonb, 4, 'seed'),
  ('allocate', 'v.', '/ˈæləkeɪt/', '배분하다, 할당하다',
   '["The manager allocated resources evenly across all projects.", "$50,000 was allocated to the marketing budget."]'::jsonb, 2, 'seed')
ON CONFLICT (word_key, lang) DO NOTHING;

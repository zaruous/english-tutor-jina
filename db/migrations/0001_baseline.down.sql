-- 0001_baseline.down.sql — baseline 되돌리기. FK 역순.
-- reset(DROP SCHEMA)과 달리 스키마 자체는 남긴다 — 러너가 schema_migrations 를 이 스키마에 둔다.
DROP TABLE IF EXISTS content_audit_log    CASCADE;
DROP TABLE IF EXISTS lesson_drafts        CASCADE;
DROP TABLE IF EXISTS ai_jobs              CASCADE;
DROP TABLE IF EXISTS user_goals           CASCADE;
DROP TABLE IF EXISTS lesson_reports       CASCADE;
DROP TABLE IF EXISTS lesson_qa_sessions   CASCADE;
DROP TABLE IF EXISTS user_lesson_attempts CASCADE;
DROP TABLE IF EXISTS correction_reviews   CASCADE;
DROP TABLE IF EXISTS corrections          CASCADE;
DROP TABLE IF EXISTS conversation_messages CASCADE;
DROP TABLE IF EXISTS conversation_sessions CASCADE;
DROP TABLE IF EXISTS vocab_quizzes        CASCADE;
DROP TABLE IF EXISTS vocab_reviews        CASCADE;
DROP TABLE IF EXISTS user_vocab_cards     CASCADE;
DROP TABLE IF EXISTS vocab_words          CASCADE;
DROP TABLE IF EXISTS topic_contents       CASCADE;
DROP TABLE IF EXISTS topics               CASCADE;
DROP TABLE IF EXISTS lesson_items         CASCADE;
DROP TABLE IF EXISTS vocab_set_details    CASCADE;
DROP TABLE IF EXISTS scenario_details     CASCADE;
DROP TABLE IF EXISTS lesson_details       CASCADE;
DROP TABLE IF EXISTS content_items        CASCADE;
DROP TABLE IF EXISTS auth_sessions        CASCADE;
DROP TABLE IF EXISTS users                CASCADE;

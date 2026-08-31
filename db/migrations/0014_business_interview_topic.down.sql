DELETE FROM public.topics WHERE slug = 'business-interview';
DELETE FROM public.vocab_sets WHERE slug = 'business-interview-core-20';
DELETE FROM public.conversation_scenarios WHERE slug = 'business-interview-star';
DELETE FROM public.lessons WHERE slug IN (
  'business-interview-part5-grammar',
  'business-interview-part5-vocabulary',
  'business-interview-part5-situations'
);


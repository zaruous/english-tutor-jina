DELETE FROM public.vocab_words
 WHERE source = 'seed'
   AND word_key IN ('accommodate','facilitate','procurement','discrepancy',
                    'reimburse','compliance','scrutinize','allocate');

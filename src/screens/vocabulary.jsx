// vocabulary.jsx — 단어장 화면 (Desktop + Mobile)
// SRS 플래시카드 복습 + 단어 목록 + AI 예문 생성

const SRS_RESULTS = ['again', 'hard', 'good', 'easy'];
const SRS_LABELS = { again: '다시', hard: '어려움', good: '보통', easy: '쉬움' };
const SRS_COLORS = {
  again: '#FC8181', hard: '#F6AD55', good: '#4FD1C5', easy: '#68D391',
};


// ─────────────────────────────────────────────────────
// Desktop Vocabulary
// ─────────────────────────────────────────────────────
function VocabularyDesktop({ theme, aiConfig, onNavigate }) {
  const {
    cards: vocabList, stats: srvStats, error: storeError,
    updateWord, addWord: addWordApi, cancelAdd, addState,
  } = useVocab();
  const [tab, setTab] = React.useState('review'); // 'review' | 'list' | 'add'
  const [reviewIdx, setReviewIdx] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [reviewed, setReviewed] = React.useState({}); // { id: result }
  const [addWord, setAddWord] = React.useState('');
  const [listFilter, setListFilter] = React.useState('all'); // 'all' | 'due' | 'learned' | 'new'

  // 복습 큐 = new + due (status는 서버 파생값)
  const dueCards = vocabList.filter((w) => w.status === 'due' || w.status === 'new');
  const currentCard = dueCards[reviewIdx];
  const reviewDone = reviewIdx >= dueCards.length;

  const handleReview = (result) => {
    if (!currentCard) return;
    updateWord(currentCard.id, result); // 낙관적 — 스토어가 실패 시 롤백
    setReviewed((r) => ({ ...r, [currentCard.id]: result }));
    setFlipped(false);
    setReviewIdx((i) => i + 1);
  };

  // 중복·정규화·SRS 초기값·저장은 전부 서버. 여기는 입력만 넘긴다.
  const addLoading = addState.pending !== null;
  const addResult = addState.result;
  const handleAddWord = async () => {
    if (!addWord.trim() || addLoading) return;
    const word = addWord.trim();
    setAddWord('');
    await addWordApi(word, { provider: aiConfig?.provider });
  };

  const filteredList = listFilter === 'all'
    ? vocabList
    : vocabList.filter((w) => w.status === listFilter);

  const stats = { due: srvStats.due, learned: srvStats.learned, newWords: srvStats.new };

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex',
    }}>
      {/* Sidebar */}
      <aside aria-label="단어장 메뉴" style={{
        width: 240, padding: '24px 16px',
        borderRight: `1px solid ${theme.border}`,
        background: theme.bgSoft,
        display: 'flex', flexDirection: 'column', gap: 4,
        flexShrink: 0,
      }}>
        {/* 로고 — 클릭하면 홈(대시보드). 공통 사이드바 로고와 같은 동작 */}
        <button type="button" onClick={() => onNavigate && onNavigate('dashboard')} aria-label="홈(대시보드)으로" title="홈으로"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 20px', width: '100%', textAlign: 'left' }}>
          <JinaAvatar size={32} theme={theme} />
          <span className="jina-serif" style={{ fontSize: 20, fontStyle: 'italic', color: theme.text }}>Jina</span>
        </button>
        {[
          { id: 'review', label: '오늘의 복습', badge: dueCards.length },
          { id: 'daily', label: '오늘의 단어 (AI 퀴즈)' },
          { id: 'list', label: '전체 단어장' },
          { id: 'add', label: '단어 추가 (+AI)' },
        ].map(({ id, label, badge }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 10, width: '100%',
            color: tab === id ? theme.text : theme.textMuted,
            background: tab === id ? theme.chipBg : 'transparent',
            fontSize: 14, fontWeight: tab === id ? 600 : 500,
            textAlign: 'left',
          }}>
            <span style={{ flex: 1 }}>{label}</span>
            {badge > 0 && (
              <span style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 999,
                background: theme.accent, color: '#fff', fontWeight: 700,
              }}>{badge}</span>
            )}
          </button>
        ))}

        <div style={{ marginTop: 'auto', padding: '16px 12px 0', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>전체 현황</div>
          {[
            { label: '오늘 복습 대기', value: stats.due, color: theme.warning },
            { label: '학습 완료', value: stats.learned, color: theme.success },
            { label: '새 단어', value: stats.newWords, color: theme.accent },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: theme.textMuted }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{
          padding: '20px 40px 18px',
          borderBottom: `1px solid ${theme.border}`,
          background: theme.bgSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>단어장</div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: theme.text, margin: 0 }}>
              {tab === 'review' && `오늘의 복습 · ${dueCards.length}개`}
              {tab === 'daily' && '오늘의 단어 · AI 퀴즈'}
              {tab === 'list' && '전체 단어장'}
              {tab === 'add' && 'AI 단어 추가'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              padding: '8px 16px', borderRadius: 10,
              background: theme.surface, border: `1px solid ${theme.border}`,
              fontSize: 13, color: theme.textMuted,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ color: theme.success, fontWeight: 700 }}>{vocabList.length}</span> 단어 보유
            </div>
          </div>
        </header>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* 서버 연결 실패 배너 — 캐시 폴백 중임을 알린다 */}
          {storeError && (
            <div style={{
              margin: '16px 40px 0', padding: '10px 14px', borderRadius: 10,
              background: theme.warning + '18', border: `1px solid ${theme.warning}40`,
              fontSize: 12.5, color: theme.warning, fontWeight: 600,
            }}>
              ⚠︎ 서버 연결 실패 — 마지막으로 불러온 목록을 표시 중입니다. ({storeError})
            </div>
          )}
          {/* ── REVIEW TAB ── */}
          {tab === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: 40 }}>
              {reviewDone ? (
                <ReviewComplete theme={theme} reviewed={reviewed} total={dueCards.length} onRestart={() => { setReviewIdx(0); setReviewed({}); }} />
              ) : (
                <FlashCard
                  theme={theme}
                  card={currentCard}
                  flipped={flipped}
                  onFlip={() => setFlipped(true)}
                  onResult={handleReview}
                  idx={reviewIdx}
                  total={dueCards.length}
                />
              )}
            </div>
          )}

          {/* ── LIST TAB ── */}
          {/* ── DAILY QUIZ TAB — 패널(src/screens/vocab-quiz.jsx)이 스토어의 quiz 액션을 직접 쓴다 ── */}
          {tab === 'daily' && (
            <DailyQuizPanel theme={theme} aiConfig={aiConfig} />
          )}
          {tab === 'list' && (
            <div style={{ padding: '28px 40px' }}>
              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                {[
                  { id: 'all', label: '전체', count: vocabList.length },
                  { id: 'due', label: '복습 대기', count: stats.due },
                  { id: 'learned', label: '학습 완료', count: stats.learned },
                  { id: 'new', label: '새 단어', count: stats.newWords },
                ].map(({ id, label, count }) => (
                  <button key={id} onClick={() => setListFilter(id)} style={{
                    padding: '7px 14px', borderRadius: 999,
                    background: listFilter === id ? theme.text : theme.chipBg,
                    color: listFilter === id ? theme.bg : theme.textMuted,
                    fontSize: 13, fontWeight: listFilter === id ? 700 : 500,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    {label}
                    <span style={{
                      fontSize: 11, padding: '1px 6px', borderRadius: 999,
                      background: listFilter === id ? 'rgba(255,255,255,0.2)' : theme.surface,
                      color: listFilter === id ? 'inherit' : theme.textDim,
                    }}>{count}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredList.map((w) => (
                  <VocabListRow key={w.id} word={w} theme={theme} />
                ))}
              </div>
            </div>
          )}

          {/* ── ADD TAB ── */}
          {tab === 'add' && (
            <div style={{ padding: '40px', maxWidth: 640 }}>
              <p style={{ fontSize: 15, color: theme.textMuted, lineHeight: 1.6, marginTop: 0, marginBottom: 28 }}>
                단어를 입력하면 AI가 자동으로 품사·발음기호·의미·예문을 생성해 단어장에 추가합니다.
              </p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input
                  value={addWord}
                  onChange={(e) => setAddWord(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddWord()}
                  placeholder="예: procrastinate, diligent, unprecedented…"
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 12,
                    background: theme.card, border: `1px solid ${theme.borderStrong}`,
                    color: theme.text, fontSize: 15, outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={addLoading ? cancelAdd : handleAddWord}
                  disabled={!addLoading && !addWord.trim()}
                  style={{
                    padding: '12px 20px', borderRadius: 12,
                    background: addLoading ? theme.error + '22' : !addWord.trim() ? theme.chipBg : theme.accentGrad,
                    color: addLoading ? theme.error : !addWord.trim() ? theme.textMuted : '#fff',
                    fontSize: 14, fontWeight: 700,
                    cursor: !addLoading && !addWord.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {addLoading ? '취소' : 'AI 추가'}
                </button>
              </div>
              {addLoading && (
                <div style={{
                  padding: '14px 18px', borderRadius: 14, marginBottom: 20,
                  background: theme.surface, border: `1px solid ${theme.border}`,
                  fontSize: 13, color: theme.textMuted, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: theme.accent, animation: 'jina-pulse 1s infinite' }} />
                  "{addState.pending}" 사전 항목을 AI가 생성하는 중… (5~15초)
                </div>
              )}
              {addResult && (
                <div style={{
                  padding: '18px 20px', borderRadius: 14,
                  background: addResult.ok ? theme.surface : theme.error + '15',
                  border: `1px solid ${addResult.ok ? theme.border : theme.error + '40'}`,
                }}>
                  {addResult.ok ? (
                    <React.Fragment>
                      <div style={{ fontSize: 12, color: theme.success, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                        {addResult.duplicate ? '이미 단어장에 있는 단어예요' : '단어 생성 완료 — 단어장에 추가됨'}
                      </div>
                      {/* 실제 저장된 카드를 렌더 — 정규식 스크래핑/원문 덤프 폐기 */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: theme.text }}>{addResult.card.word}</span>
                        <span style={{ fontSize: 13, color: theme.textMuted }}>{addResult.card.pos}</span>
                        <span style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic' }}>{addResult.card.ipa}</span>
                        <SpeakButton text={addResult.card.word} theme={theme} size={14} />
                        <span style={{ display: 'inline-flex', gap: 3, marginLeft: 'auto' }}>
                          {[1, 2, 3, 4, 5].map((d) => (
                            <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: d <= addResult.card.difficulty ? theme.accent : theme.chipBg }} />
                          ))}
                        </span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: theme.text, marginBottom: 10 }}>{addResult.card.meaning_ko}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {addResult.card.examples.map((ex, i) => (
                          <div key={i} style={{
                            padding: '9px 13px', borderRadius: 10,
                            background: theme.card, border: `1px solid ${theme.border}`,
                            fontSize: 13, color: theme.textMuted, fontStyle: 'italic', lineHeight: 1.55,
                          }}>"{ex}"</div>
                        ))}
                      </div>
                    </React.Fragment>
                  ) : (
                    <div style={{ fontSize: 13, color: theme.error, lineHeight: 1.6 }}>
                      오류: {addResult.error}
                      {addResult.hint && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>해결법: {addResult.hint}</div>}
                    </div>
                  )}
                </div>
              )}
              {/* Recently added preview */}
              <div style={{ marginTop: 36 }}>
                <div style={{ fontSize: 12, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>최근 추가된 단어</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {vocabList.filter((w) => w.status === 'new').map((w) => (
                    <VocabListRow key={w.id} word={w} theme={theme} compact />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// FlashCard
// ─────────────────────────────────────────────────────
function FlashCard({ theme, card, flipped, onFlip, onResult, idx, total }) {
  return (
    <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
      {/* Progress bar */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 99, background: theme.surface, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            background: theme.accentGrad,
            width: `${(idx / total) * 100}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600, flexShrink: 0 }}>{idx}/{total}</span>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', borderRadius: 24,
        background: theme.surface, border: `1px solid ${theme.border}`,
        boxShadow: theme.shadow,
        overflow: 'hidden',
        minHeight: 280,
      }}>
        {/* Front — word */}
        <div style={{ padding: '44px 40px 36px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>영어 단어</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: theme.text, letterSpacing: '-0.02em', marginBottom: 10 }}>
            {card.word}
          </div>
          <div style={{ fontSize: 16, color: theme.textMuted, letterSpacing: '0.01em' }}>
            {card.pos} &nbsp; <span style={{ fontStyle: 'italic', opacity: 0.7 }}>{card.ipa}</span>
            <SpeakButton text={card.word} theme={theme} size={16} style={{ verticalAlign: 'middle', marginLeft: 8 }} />
          </div>
          {/* Difficulty dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 18 }}>
            {[1, 2, 3, 4, 5].map((d) => (
              <span key={d} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: d <= card.difficulty ? theme.accent : theme.chipBg,
              }} />
            ))}
          </div>
        </div>

        {/* Flip divider */}
        <div style={{ borderTop: `1px solid ${theme.border}` }} />

        {/* Back — meaning */}
        {!flipped ? (
          <div style={{ padding: '24px 40px', display: 'flex', justifyContent: 'center' }}>
            <button onClick={onFlip} style={{
              padding: '12px 32px', borderRadius: 12,
              background: theme.text, color: theme.bg,
              fontSize: 14, fontWeight: 700,
            }}>
              의미 확인 →
            </button>
          </div>
        ) : (
          <div style={{ padding: '28px 40px', animation: 'jina-rise 0.25s ease-out' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, marginBottom: 14 }}>
              {card.meaning_ko}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {card.examples.map((ex, i) => (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: theme.card, border: `1px solid ${theme.border}`,
                  fontSize: 13.5, color: theme.textMuted, lineHeight: 1.55,
                  fontStyle: 'italic',
                }}>
                  "{ex}"
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SRS buttons — only after flip */}
      {flipped && (
        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, animation: 'jina-rise 0.2s ease-out' }}>
          {SRS_RESULTS.map((r) => (
            <button key={r} onClick={() => onResult(r)} style={{
              padding: '14px 8px', borderRadius: 14,
              background: SRS_COLORS[r] + '22',
              color: SRS_COLORS[r],
              border: `1.5px solid ${SRS_COLORS[r]}44`,
              fontSize: 14, fontWeight: 700,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}>
              <span>{SRS_LABELS[r]}</span>
              <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 500 }}>
                {card.preview?.[r]?.label || ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Review Complete
// ─────────────────────────────────────────────────────
function ReviewComplete({ theme, reviewed, total, onRestart }) {
  const counts = SRS_RESULTS.reduce((acc, r) => {
    acc[r] = Object.values(reviewed).filter((v) => v === r).length;
    return acc;
  }, {});
  const pct = total > 0 ? Math.round(((counts.good + counts.easy) / total) * 100) : 0;

  return (
    <div style={{ textAlign: 'center', maxWidth: 440 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
      <div className="jina-serif" style={{ fontSize: 34, fontStyle: 'italic', color: theme.text, marginBottom: 8 }}>
        복습 완료!
      </div>
      <div style={{ fontSize: 15, color: theme.textMuted, marginBottom: 32, lineHeight: 1.6 }}>
        오늘의 {total}개 단어를 모두 복습했어요.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {SRS_RESULTS.map((r) => (
          <div key={r} style={{
            padding: '14px 8px', borderRadius: 14,
            background: SRS_COLORS[r] + '18',
            border: `1px solid ${SRS_COLORS[r]}30`,
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: SRS_COLORS[r] }}>{counts[r]}</div>
            <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, marginTop: 4 }}>{SRS_LABELS[r]}</div>
          </div>
        ))}
      </div>
      <div style={{
        padding: '16px 24px', borderRadius: 14,
        background: theme.surface, border: `1px solid ${theme.border}`,
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 6 }}>정확도</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: pct >= 70 ? theme.success : theme.warning }}>{pct}%</div>
      </div>
      <button onClick={onRestart} style={{
        padding: '13px 28px', borderRadius: 12,
        background: theme.text, color: theme.bg,
        fontSize: 14, fontWeight: 700,
      }}>
        다시 복습
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Vocab List Row
// ─────────────────────────────────────────────────────
function VocabListRow({ word: w, theme, compact = false }) {
  const [open, setOpen] = React.useState(false);
  const statusColor = w.status === 'due' ? theme.warning : w.status === 'learned' ? theme.success : theme.accent;
  const statusLabel = w.status === 'due' ? '복습 대기' : w.status === 'learned' ? '학습 완료' : '새 단어';

  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      background: theme.surface, border: `1px solid ${theme.border}`,
    }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: compact ? '12px 16px' : '16px 20px',
          cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <span style={{ fontSize: compact ? 16 : 18, fontWeight: 700, color: theme.text }}>{w.word}</span>
            <span style={{ fontSize: 12, color: theme.textDim, marginLeft: 8 }}>{w.pos}</span>
            <span style={{ fontSize: 12, color: theme.textDim, marginLeft: 6, fontStyle: 'italic' }}>{w.ipa}</span>
            <SpeakButton text={w.word} theme={theme} size={13} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
          </div>
          <span style={{ fontSize: 14, color: theme.textMuted, marginLeft: 4 }}>{w.meaning_ko}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 10.5, padding: '3px 8px', borderRadius: 999,
            background: statusColor + '20', color: statusColor, fontWeight: 700,
          }}>{statusLabel}</span>
          <span style={{ fontSize: 11, color: theme.textDim }}>{w.next_review}</span>
          <span style={{ color: theme.textDim, fontSize: 13 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{
          padding: '0 20px 16px',
          borderTop: `1px solid ${theme.border}`,
          animation: 'jina-rise 0.15s ease-out',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {w.examples.map((ex, i) => (
              <div key={i} style={{
                padding: '10px 14px', borderRadius: 10,
                background: theme.card, border: `1px solid ${theme.border}`,
                fontSize: 13.5, color: theme.textMuted, lineHeight: 1.55,
                fontStyle: 'italic',
              }}>
                "{ex}"
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11.5, color: theme.textDim }}>
            <span>복습 {w.review_count}회</span>
            <span>간격 {w.interval_days}일</span>
            <span>정확도 {w.review_count > 0 ? Math.round(((w.review_count - w.fail_count) / w.review_count) * 100) : '—'}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Mobile Vocabulary
// ─────────────────────────────────────────────────────
function MobileVocabulary({ theme, aiConfig, noNav = false, onNavigate }) {
  const { cards: vocabList, updateWord } = useVocab(); // Desktop과 같은 Context — state 분리 해소
  const [tab, setTab] = React.useState('review'); // 'review' | 'list'
  const [reviewIdx, setReviewIdx] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [reviewed, setReviewed] = React.useState({});

  const dueCards = vocabList.filter((w) => w.status === 'due' || w.status === 'new');
  const currentCard = dueCards[reviewIdx];
  const reviewDone = reviewIdx >= dueCards.length;

  const handleReview = (result) => {
    if (!currentCard) return;
    updateWord(currentCard.id, result);
    setReviewed((r) => ({ ...r, [currentCard.id]: result }));
    setFlipped(false);
    setReviewIdx((i) => i + 1);
  };

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>단어장</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>
            {tab === 'review' ? `복습 대기 ${dueCards.length}개` : tab === 'daily' ? '오늘의 단어 · AI 퀴즈' : '전체 단어'}
          </div>
        </div>
        <div style={{
          padding: '6px 12px', borderRadius: 999,
          background: theme.chipBg, fontSize: 13, fontWeight: 700, color: theme.accent,
        }}>
          {vocabList.length}단어
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', padding: '0 16px 12px', gap: 8 }}>
        {[
          { id: 'review', label: '복습', badge: dueCards.length },
          { id: 'daily', label: '오늘의 단어' },
          { id: 'list', label: '전체 목록' },
        ].map(({ id, label, badge }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '8px 14px', borderRadius: 999,
            background: tab === id ? theme.text : theme.chipBg,
            color: tab === id ? theme.bg : theme.textMuted,
            fontSize: 13, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {label}
            {badge > 0 && tab !== id && (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 999,
                background: theme.accent, color: '#fff', fontWeight: 700,
              }}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 100px' }}>
        {tab === 'review' && (
          reviewDone ? (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
              <div className="jina-serif" style={{ fontSize: 28, fontStyle: 'italic', color: theme.text, marginBottom: 8 }}>복습 완료!</div>
              <div style={{ fontSize: 14, color: theme.textMuted, marginBottom: 24 }}>오늘의 {dueCards.length}개 단어를 모두 복습했어요.</div>
              <button onClick={() => { setReviewIdx(0); setReviewed({}); setFlipped(false); }} style={{
                padding: '13px 28px', borderRadius: 12,
                background: theme.text, color: theme.bg,
                fontSize: 14, fontWeight: 700,
              }}>다시 복습</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 4 }}>
              {/* Progress */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 99, background: theme.surface }}>
                  <div style={{ height: '100%', borderRadius: 99, background: theme.accentGrad, width: `${(reviewIdx / dueCards.length) * 100}%`, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: 12, color: theme.textMuted }}>{reviewIdx}/{dueCards.length}</span>
              </div>

              {/* Card */}
              <div style={{
                borderRadius: 20, background: theme.surface, border: `1px solid ${theme.border}`,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '36px 24px 28px', textAlign: 'center' }}>
                  <div style={{ fontSize: 40, fontWeight: 800, color: theme.text, marginBottom: 8 }}>{currentCard.word}</div>
                  <div style={{ fontSize: 14, color: theme.textMuted }}>
                    {currentCard.pos} · <span style={{ fontStyle: 'italic' }}>{currentCard.ipa}</span>
                    <SpeakButton text={currentCard.word} theme={theme} size={15} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${theme.border}` }} />
                {!flipped ? (
                  <div style={{ padding: '18px 24px', textAlign: 'center' }}>
                    <button onClick={() => setFlipped(true)} style={{
                      padding: '11px 28px', borderRadius: 10,
                      background: theme.text, color: theme.bg,
                      fontSize: 14, fontWeight: 700,
                    }}>의미 확인 →</button>
                  </div>
                ) : (
                  <div style={{ padding: '20px 24px', animation: 'jina-rise 0.2s ease-out' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 12 }}>{currentCard.meaning_ko}</div>
                    {currentCard.examples.map((ex, i) => (
                      <div key={i} style={{
                        padding: '9px 12px', borderRadius: 9, marginBottom: 8,
                        background: theme.card, border: `1px solid ${theme.border}`,
                        fontSize: 12.5, color: theme.textMuted, fontStyle: 'italic', lineHeight: 1.5,
                      }}>"{ex}"</div>
                    ))}
                  </div>
                )}
              </div>

              {/* SRS buttons */}
              {flipped && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, animation: 'jina-rise 0.2s ease-out' }}>
                  {SRS_RESULTS.map((r) => (
                    <button key={r} onClick={() => handleReview(r)} style={{
                      padding: '12px 4px', borderRadius: 12,
                      background: SRS_COLORS[r] + '22', color: SRS_COLORS[r],
                      border: `1.5px solid ${SRS_COLORS[r]}44`,
                      fontSize: 12, fontWeight: 700,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    }}>
                      <span>{SRS_LABELS[r]}</span>
                      <span style={{ fontSize: 9, opacity: 0.7 }}>
                        {currentCard.preview?.[r]?.label || ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {tab === 'daily' && <DailyQuizPanel theme={theme} aiConfig={aiConfig} compact />}
        {tab === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
            {vocabList.map((w) => (
              <VocabListRow key={w.id} word={w} theme={theme} compact />
            ))}
          </div>
        )}
      </div>

      {!noNav && <AppMobileNav theme={theme} active="vocabulary" onNavigate={onNavigate} />}
    </div>
  );
}

window.VocabularyDesktop = VocabularyDesktop;
window.MobileVocabulary = MobileVocabulary;

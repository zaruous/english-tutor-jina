// mistakes.jsx — 오답 노트 화면 (Desktop + Mobile) · 플랜 08 Phase A
// 목록의 단일 소스는 서버 파생 쿼리(GET /api/mistakes) — 이 파일에 mock 리터럴은 없다.
//  - "미극복" = 레슨별 최신 attempt 에서 틀린 문항. 다시 풀어 맞히면 서버 목록에서 빠진다(극복).
//  - 본인 제출 데이터만 오므로 정답·해설을 그대로 렌더한다(플랜 07 '제출 후 공개' 규범).
//  - [레슨 다시 풀기] = lesson-store 의 select(lesson_id) + 학습 탭 이동, [Jina에게 물어보기] 도 같은 이동(Q&A 패널은 레슨 화면에 있다).

// skill_code 라벨 — 서버가 주는 코드는 그대로 두고 표시만 한국어로. 모르는 코드는 코드 자체를 보여준다.
// 값은 lesson_items_skill_ck 가 허용하는 5종 + 미분류(NULL → 'unknown')
const SKILL_LABELS = {
  grammar: '문법', vocab: '어휘', detail: '세부사항',
  inference: '추론', main_idea: '주제', unknown: '미분류',
};
const skillLabel = (code) => SKILL_LABELS[code] || code;

// PART 배지 — lessons.kind 에서 파생. 색은 테마 accent 계열을 번갈아 쓴다.
const KIND_META = {
  toeic_part5: { label: 'PART 5 · 문법', tone: 'accent' },
  toeic_part7: { label: 'PART 7 · 독해', tone: 'accent2' },
  toeic_lc:    { label: 'LISTENING',    tone: 'success' },
};

function useMistakes(skill) {
  const [state, setState] = React.useState({
    mistakes: [], by_skill: [], total: 0, overcome: 0, loading: true, error: null,
  });
  const load = React.useCallback(async (s) => {
    setState((p) => ({ ...p, loading: true }));
    const qs = s && s !== 'all' ? `?skill=${encodeURIComponent(s)}` : '';
    const res = await window.JINA_API.get(`/api/mistakes${qs}`);
    setState(res.ok
      ? { ...res, loading: false, error: null }
      : { mistakes: [], by_skill: [], total: 0, overcome: 0, loading: false,
          error: res.hint ? `${res.error} — ${res.hint}` : res.error });
  }, []);
  React.useEffect(() => { load(skill); }, [skill, load]);
  return state;
}

// 오답 카드 — 데스크탑/모바일 공용. compact 는 여백만 줄인다.
function MistakeCard({ theme, m, onRetake, onAsk, compact = false }) {
  const kind = KIND_META[m.kind] || { label: m.kind, tone: 'accent' };
  const tone = theme[kind.tone] || theme.accent;
  const when = m.last_wrong_at ? String(m.last_wrong_at).slice(0, 10) : '';
  const badge = {
    fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
  };
  const ansChip = (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '9px 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 600,
    background: color + '1a', border: `1px solid ${color}59`, color,
    maxWidth: '100%', minWidth: 0,
  });

  return (
    <article data-testid="mistake-card" style={{
      background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 15,
      padding: compact ? '16px 18px' : '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ ...badge, background: tone + '29', color: tone }}>{kind.label}</span>
        <span style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>
          {m.lesson_title}{m.lesson_subtitle ? ` · ${m.lesson_subtitle}` : ''}
        </span>
        <span data-testid="mistake-skill" style={{
          ...badge, background: theme.chipBg, color: theme.textMuted,
          fontFamily: 'ui-monospace, Consolas, monospace',
        }}>{m.skill_code || 'unknown'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: theme.error, fontWeight: 700 }}>
          {m.times_wrong}회 틀림
        </span>
      </div>

      <p style={{ fontSize: compact ? 15 : 16.5, fontWeight: 600, lineHeight: 1.55, margin: '0 0 14px' }}>
        <span style={{ color: theme.textDim, marginRight: 8 }}>Q{m.position}.</span>{m.stem}
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={ansChip(theme.error)}>
          <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.75, letterSpacing: '0.05em' }}>내 답</span>
          ({m.my_answer}) {m.my_answer_text} ✗
        </span>
        <span style={ansChip(theme.success)}>
          <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.75, letterSpacing: '0.05em' }}>정답</span>
          ({m.answer}) {m.answer_text} ✓
        </span>
      </div>

      {m.explanation && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: theme.card, border: `1px solid ${theme.border}`,
          fontSize: 13, color: theme.textMuted, lineHeight: 1.65,
        }}>
          <b style={{ color: theme.text, fontWeight: 700, marginRight: 6 }}>해설</b>{m.explanation}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ marginRight: 'auto', fontSize: 11.5, color: theme.textDim }}>
          마지막 오답 {when}
        </span>
        <button data-testid="mistake-ask" onClick={() => onAsk(m)} style={{
          padding: '10px 16px', borderRadius: 12, background: 'transparent',
          border: `1px solid ${theme.borderStrong}`, color: theme.text,
          fontSize: 13.5, fontWeight: 600,
        }}>Jina에게 물어보기</button>
        <button data-testid="mistake-retake" onClick={() => onRetake(m)} style={{
          padding: '11px 18px', borderRadius: 12, background: theme.accentGrad,
          color: '#fff', fontSize: 13.5, fontWeight: 700,
        }}>레슨 다시 풀기 →</button>
      </div>
    </article>
  );
}

// 필터 칩 — 개수 배지는 전체 집계(by_skill) 기준이라 필터를 바꿔도 흔들리지 않는다.
function MistakeFilters({ theme, bySkill, total, skill, onPick }) {
  const chips = [{ id: 'all', label: '전체', count: total }]
    .concat(bySkill.map((s) => ({ id: s.skill_code, label: skillLabel(s.skill_code), count: s.count })));
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {chips.map(({ id, label, count }) => (
        <button key={id} data-testid={`mistake-chip-${id}`} onClick={() => onPick(id)} style={{
          padding: '7px 14px', borderRadius: 999,
          background: skill === id ? theme.text : theme.chipBg,
          color: skill === id ? theme.bg : theme.textMuted,
          fontSize: 13, fontWeight: skill === id ? 700 : 500,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {label}
          <span style={{
            fontSize: 11, padding: '1px 6px', borderRadius: 999,
            background: skill === id ? 'rgba(255,255,255,0.2)' : theme.surface,
            color: skill === id ? 'inherit' : theme.textDim,
          }}>{count}</span>
        </button>
      ))}
    </div>
  );
}

function MistakesEmpty({ theme, filtered }) {
  return (
    <div data-testid="mistakes-empty" style={{
      padding: '48px 24px', borderRadius: 14,
      background: theme.card, border: `1px dashed ${theme.border}`,
      textAlign: 'center', color: theme.textMuted, lineHeight: 1.7,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
        {filtered ? '이 유형의 오답이 없어요' : '아직 오답이 없어요'}
      </div>
      <div style={{ fontSize: 13 }}>
        {filtered
          ? '다른 유형 칩을 선택해 보세요.'
          : 'TOEIC 학습에서 레슨을 풀면 틀린 문항이 여기에 모입니다.'}
      </div>
    </div>
  );
}

// 공통 동작: 레슨 선택 후 학습 탭으로 이동 (Q&A 패널은 레슨 화면 안에 있다)
function useMistakeActions(onNavigate) {
  const { select } = useLesson();
  const go = React.useCallback(async (m) => {
    await select(m.lesson_id);
    if (onNavigate) onNavigate('lesson');
  }, [select, onNavigate]);
  return { onRetake: go, onAsk: go };
}

// ─────────────────────────────────────────────────────
// Desktop
// ─────────────────────────────────────────────────────
function MistakesDesktop({ theme, onNavigate }) {
  const [skill, setSkill] = React.useState('all');
  const { mistakes, by_skill: bySkill, total, overcome, loading, error } = useMistakes(skill);
  const { onRetake, onAsk } = useMistakeActions(onNavigate);
  const allTotal = bySkill.reduce((n, s) => n + s.count, 0);

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <header style={{
        padding: '22px 40px 18px', borderBottom: `1px solid ${theme.border}`, background: theme.bgSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div>
          <div style={{
            fontSize: 11, color: theme.textDim, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
          }}>시험 대비</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>오답 노트</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { k: '미극복', v: allTotal, c: theme.warning, id: 'open' },
            { k: '극복', v: overcome, c: theme.success, id: 'overcome' },
          ].map(({ k, v, c, id }) => (
            <span key={id} data-testid={`mistakes-stat-${id}`} style={{
              padding: '8px 16px', borderRadius: 10, background: theme.surface,
              border: `1px solid ${theme.border}`, fontSize: 13, color: theme.textMuted,
            }}>{k} <b style={{ color: c, fontWeight: 700 }}>{v}</b>문항</span>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: '26px 40px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 22, flexWrap: 'wrap' }}>
          <MistakeFilters theme={theme} bySkill={bySkill} total={allTotal} skill={skill} onPick={setSkill} />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: theme.textDim }}>
            레슨별 최신 답안 기준 — 다시 풀어 맞히면 자동으로 극복 처리됩니다
          </span>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: theme.error + '18', border: `1px solid ${theme.error}44`,
            fontSize: 12.5, color: theme.error, fontWeight: 600,
          }}>오답 노트를 불러오지 못했습니다. ({error})</div>
        )}
        {loading && !mistakes.length && (
          <div style={{ fontSize: 13, color: theme.textMuted, padding: '20px 0' }}>오답을 불러오는 중…</div>
        )}
        {!loading && !error && mistakes.length === 0 && (
          <MistakesEmpty theme={theme} filtered={skill !== 'all'} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mistakes.map((m) => (
            <MistakeCard key={`${m.lesson_id}-${m.position}`} theme={theme} m={m}
              onRetake={onRetake} onAsk={onAsk} />
          ))}
        </div>

        {overcome > 0 && (
          <div style={{ textAlign: 'center', padding: 18, fontSize: 13, color: theme.textDim }}>
            ✓ 극복한 오답 <b style={{ color: theme.success }}>{overcome}문항</b> — 다시 맞힌 문항은 목록에서 빠집니다
          </div>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Mobile
// ─────────────────────────────────────────────────────
function MobileMistakes({ theme, noNav = false, onNavigate }) {
  const [skill, setSkill] = React.useState('all');
  const { mistakes, by_skill: bySkill, overcome, loading, error } = useMistakes(skill);
  const { onRetake, onAsk } = useMistakeActions(onNavigate);
  const allTotal = bySkill.reduce((n, s) => n + s.count, 0);

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: 11, color: theme.textDim, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2,
          }}>시험 대비</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>오답 노트</div>
        </div>
        <span style={{
          padding: '6px 12px', borderRadius: 999, background: theme.chipBg,
          fontSize: 13, fontWeight: 700, color: theme.warning,
        }}>{allTotal}문항</span>
      </div>

      <div style={{ padding: '0 16px 12px', overflowX: 'auto' }}>
        <MistakeFilters theme={theme} bySkill={bySkill} total={allTotal} skill={skill} onPick={setSkill} />
      </div>

      <main style={{ flex: 1, overflow: 'auto', padding: `0 16px ${noNav ? 24 : 100}px` }}>
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 12,
            background: theme.error + '18', border: `1px solid ${theme.error}44`,
            fontSize: 12.5, color: theme.error, fontWeight: 600,
          }}>오답 노트를 불러오지 못했습니다.</div>
        )}
        {loading && !mistakes.length && (
          <div style={{ fontSize: 13, color: theme.textMuted, padding: '16px 0' }}>오답을 불러오는 중…</div>
        )}
        {!loading && !error && mistakes.length === 0 && (
          <MistakesEmpty theme={theme} filtered={skill !== 'all'} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mistakes.map((m) => (
            <MistakeCard key={`${m.lesson_id}-${m.position}`} theme={theme} m={m}
              onRetake={onRetake} onAsk={onAsk} compact />
          ))}
        </div>
        {overcome > 0 && (
          <div style={{ textAlign: 'center', padding: 16, fontSize: 12.5, color: theme.textDim }}>
            ✓ 극복한 오답 <b style={{ color: theme.success }}>{overcome}문항</b>
          </div>
        )}
      </main>

      {!noNav && <AppMobileNav theme={theme} active="mistakes" onNavigate={onNavigate} />}
    </div>
  );
}

window.MistakesDesktop = MistakesDesktop;
window.MobileMistakes = MobileMistakes;

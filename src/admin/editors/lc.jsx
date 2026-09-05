// editors/lc.jsx — 관리자 · LC 에디터 최소형 (플랜 13 Phase A)
// 목업 시각 기준: docs/plan/mockups/13-lc-editor.html — CSS 는 복사하지 않고 theme.* 인라인 스타일.
//
// 이 화면의 일은 **AI 가 만든 것을 고치는 것**이다(플랜 13 §0). 그래서 줄 추가/삭제만 있고
// 순서 드래그·문항 추가/삭제는 없다 — 문항 수는 불러온 그대로, 신규는 3 고정.
//
// ── 세 가지 규범 ─────────────────────────────────────────────────────────────
// 1. 스크립트 편집 단위는 **화자 토글 + 대사**다(설계 검토 D1). passage.body 가 [{speaker,text}] 라서
//    (플랜 10.7 §3.2) 저장 페이로드도 그 모양 그대로 보낸다. "M: " 접두를 텍스트로 만들면 서버가
//    다시 파싱해야 하고 validateLcScript 가 라벨 잔존으로 거부한다.
// 2. 검증 규칙의 단일 소스는 서버다(결정 2). 이 화면은 422 의 validation_errors 를 하단 띠에
//    **그대로** 렌더할 뿐 규칙을 다시 판단하지 않는다. 오류 문구의 `script[N]`·`items[N]` 접두로
//    해당 줄·문항을 붉게 표시하는 것까지가 이 화면의 몫이다.
// 3. 학습자 DTO(GET /api/lessons/:id)는 정답을 주지 않는다. 그래서 여기서는 관리자 읽기
//    GET /api/admin/contents/lesson/:id 로 answer·explanation·skill_code 까지 받는다(D2).
//
// 최상위 이름은 전부 전역이다(content-store.jsx 머리말) — AdminLc/ADMIN_LC 접두를 쓴다.
// admin.html 이 admin-app.jsx 보다 **먼저** 로드하므로 admin-app 의 헬퍼(adminGoto·adminTint)를
// 최상위에서 참조하면 안 된다. 라우팅은 해시를 직접 쓰고, 색 헬퍼는 여기 따로 둔다.

const ADMIN_LC_SPEAKERS = ['M', 'W'];
const ADMIN_LC_OPTION_IDS = ['A', 'B', 'C', 'D'];
// lesson_items_skill_ck 와 같은 집합. '' 는 NULL(없음)로 보낸다.
const ADMIN_LC_SKILLS = ['grammar', 'vocab', 'detail', 'inference', 'main_idea'];
// 에디터가 만들 수 있는 kind. toeic_lc 만 화자 토글 스크립트이고, 그 외는 passage.body 가
// 문자열 배열이라 textarea 하나로 편집한다(플랜 13 Phase A "Part 7 — 같은 폼, 지문 필드가 본문 하나").
const ADMIN_LC_KINDS = [
  { key: 'toeic_lc', label: '리스닝 · toeic_lc' },
  { key: 'toeic_part7', label: 'Part 7 · toeic_part7' },
];
// 빈 폼의 줄 수 — validateLcScript 하한(4)과 같다. 처음부터 규칙 안에서 시작하게 한다.
const ADMIN_LC_NEW_LINES = 4;
// 신규 문항 수. 문항 추가/삭제 UI 가 없으므로(§0) 이 값이 곧 새 레슨의 문항 수다.
const ADMIN_LC_NEW_ITEMS = 3;
// Part 7 지문의 문단 구분. textarea 의 빈 줄 하나가 passage.body 배열의 원소 하나다.
const ADMIN_LC_PARAGRAPH_SEP = '\n\n';

// admin-app.jsx 의 adminTint 와 같은 규칙 — hex 색에만 알파 2자리를 덧붙인다. rgba 에 붙이면
// `rgba(...)29` 라는 파싱 불가 값이 되어 선언이 통째로 무시된다. admin-app 이 뒤에 로드되므로 따로 둔다.
function adminLcTint(color, hexAlpha, fallback) {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color + hexAlpha : fallback;
}

// 새 줄의 화자는 앞 줄과 반대로 둔다 — 대화는 번갈아 말하고, 비워 두면 저장이 speaker 오류로 막힌다.
function adminLcNextSpeaker(lines) {
  return lines[lines.length - 1]?.speaker === 'M' ? 'W' : 'M';
}

function adminLcBlankScript() {
  const lines = [];
  for (let i = 0; i < ADMIN_LC_NEW_LINES; i += 1) lines.push({ speaker: adminLcNextSpeaker(lines), text: '' });
  return lines;
}

function adminLcBlankItem() {
  return {
    stem: '', answer: '', explanation: '', skill_code: '',
    options: ADMIN_LC_OPTION_IDS.map((id) => ({ id, text: '' })),
  };
}

// 서버가 준 줄 하나를 폼 모양으로. 화자가 M/W 가 아니면 비워 둔다 — 토글이 "지정 안 됨" 으로 보이고
// 저장하면 서버가 script[N].speaker 오류로 알려 준다. 문자열(구 포맷)도 라벨을 떼지 않고 그대로 둔다:
// 10.7 이 정규식으로 라벨을 파싱하는 코드를 없앤 이유를 화면에서 되살리지 않는다.
function adminLcLineFromServer(line) {
  if (line && typeof line === 'object') {
    return { speaker: ADMIN_LC_SPEAKERS.includes(line.speaker) ? line.speaker : '', text: String(line.text ?? '') };
  }
  return { speaker: '', text: String(line ?? '') };
}

// 보기는 A~D 순서로 고정해 그린다. 서버 행에 빠진 id 가 있으면 빈 칸으로 채워 폼이 무너지지 않게 한다.
function adminLcItemFromServer(item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  return {
    stem: String(item?.stem ?? ''),
    answer: ADMIN_LC_OPTION_IDS.includes(item?.answer) ? item.answer : '',
    explanation: String(item?.explanation ?? ''),
    skill_code: ADMIN_LC_SKILLS.includes(item?.skill_code) ? item.skill_code : '',
    options: ADMIN_LC_OPTION_IDS.map((id) => ({
      id, text: String(options.find((o) => o?.id === id)?.text ?? ''),
    })),
  };
}

// 폼 상태 하나가 두 kind 의 지문을 다 들고 있다 — kind 셀렉트를 바꿨다가 되돌려도 입력이 사라지지 않게.
// passageMeta 는 body 를 뺀 passage 의 나머지(type·subject, Part 7 이메일이면 from·to·cc·date)다.
// vocab·faq 는 이 화면이 편집하지 않지만 **반드시 들고 다닌다** — 서버 PATCH 가 lesson_details 를 통째로
// 갈아 끼우므로(admin-authoring.service normalizeLessonInput: 안 보내면 []) 빠뜨리면 시드 Part 7 의
// 어휘·FAQ 가 저장 한 번에 사라진다.
function adminLcBlankForm() {
  return {
    kind: 'toeic_lc', title: '', subtitle: '', difficulty: 3, est_minutes: 4,
    script: adminLcBlankScript(),
    passageMeta: { type: '', subject: '' },
    passageText: '',
    vocab: [], faq: [],
    items: Array.from({ length: ADMIN_LC_NEW_ITEMS }, adminLcBlankItem),
    status: 'draft', visibility: 'private', source: null,
  };
}

function adminLcFormFromServer(lesson) {
  const passage = lesson?.passage && typeof lesson.passage === 'object' ? lesson.passage : {};
  const { body, ...passageMeta } = passage;
  const lines = Array.isArray(body) ? body : body ? [body] : [];
  const isLc = lesson?.kind === 'toeic_lc';
  const items = Array.isArray(lesson?.items) ? lesson.items : [];
  return {
    kind: lesson?.kind || 'toeic_lc',
    title: String(lesson?.title ?? ''),
    subtitle: String(lesson?.subtitle ?? ''),
    difficulty: lesson?.difficulty ?? 3,
    est_minutes: lesson?.est_minutes ?? 4,
    script: isLc && lines.length ? lines.map(adminLcLineFromServer) : adminLcBlankScript(),
    // LC 도 서버의 passage 메타(type·subject)를 그대로 들고 다닌다 — 버리면 저장 한 번에 서버 기본값
    // (LISTENING/Short Conversation)으로 덮여 시드 'Short Talk' 가 'Short Conversation' 이 된다(라운드 05 리뷰).
    // LC ↔ Part 7/5 를 오가는 순간에만 비운다(kind 셀렉트의 onChange) — 'LISTENING' 이 Part 7 지문 종류로 딸려 가지 않게.
    passageMeta,
    passageText: isLc ? '' : lines.map((p) => String(p ?? '')).join(ADMIN_LC_PARAGRAPH_SEP),
    vocab: Array.isArray(lesson?.vocab) ? lesson.vocab : [],
    faq: Array.isArray(lesson?.faq) ? lesson.faq : [],
    items: items.length ? items.map(adminLcItemFromServer) : Array.from({ length: ADMIN_LC_NEW_ITEMS }, adminLcBlankItem),
    status: lesson?.status || 'draft',
    visibility: lesson?.visibility || 'private',
    source: lesson?.source || null,
  };
}

// 저장 페이로드 — admin-authoring.service normalizeLessonInput 이 받는 모양. passage.body 가 지문이다:
//   LC   → passage: { body: [{speaker,text}] }          type·subject 는 서버 기본값(LISTENING/Short Conversation)
//   그 외 → passage: { type·subject·from…, body: [문단…] }  textarea 를 빈 줄 기준으로 쪼갠다(시드 Part 7 과 같은 모양)
// 서버는 LC 의 body 를 검증기의 script 로 넘기므로(D3) 여기서 "M: " 접두를 만들 일이 없다.
// 공백 정리만 하고 규칙 판단은 하지 않는다. 비어 있으면 빈 채로 보내 서버 오류 문구를 받는다.
function adminLcPayload(form) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const passage = {};
  if (form.kind === 'toeic_lc') {
    // 불러온 type·subject 는 그대로 보낸다(비어 있으면 서버 기본값). 화면에는 입력이 없다 — LC 의 메타는 고칠 일이 없다.
    Object.entries(form.passageMeta || {}).forEach(([k, v]) => {
      if (typeof v === 'string' && v.trim()) passage[k] = v.trim();
    });
    passage.body = form.script.map((l) => ({ speaker: l.speaker, text: l.text.trim() }));
  } else {
    // 빈 머리 필드는 보내지 않는다 — 서버가 '' 를 "없다" 로 읽어 기본값을 채우게 두는 편이 낫다.
    Object.entries(form.passageMeta).forEach(([k, v]) => {
      if (typeof v === 'string' && v.trim()) passage[k] = v.trim();
    });
    passage.body = form.passageText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }
  return {
    kind: form.kind,
    title: form.title.trim(),
    subtitle: form.subtitle.trim(),
    difficulty: num(form.difficulty),
    est_minutes: num(form.est_minutes),
    passage,
    vocab: form.vocab,
    faq: form.faq,
    items: form.items.map((it) => ({
      stem: it.stem.trim(),
      options: it.options.map((o) => ({ id: o.id, text: o.text.trim() })),
      answer: it.answer,
      explanation: it.explanation.trim(),
      skill_code: it.skill_code || null,
    })),
  };
}

// 오류 문구의 접두(`script[2].speaker …`, `items[0].answer …`)로 어느 줄·문항인지 뽑는다 —
// 하단 띠만 있으면 8줄·3문항 사이에서 어디를 고쳐야 하는지 눈으로 찾아야 한다.
// 문구 형식은 ai-job.service.js validateLcScript/validateGeneratedLesson 의 것이다.
function adminLcErrorTargets(errors) {
  const t = { script: new Set(), items: new Set() };
  (errors || []).forEach((e) => {
    const m = /^(script|items)\[(\d+)\]/.exec(String(e));
    if (m) t[m[1]].add(Number(m[2]));
  });
  return t;
}

// 응답 봉투 { ok, lesson } 에서 레슨 본문을 꺼낸다 — readLesson·createLesson·updateLesson 셋 다 같은 모양이고
// items 에 answer·explanation·skill_code 가 실려 있다(admin-authoring.service fetchLesson).
function adminLcLessonOf(res) {
  return res?.lesson && typeof res.lesson === 'object' ? res.lesson : null;
}

function adminLcRequestError(res, fallback) {
  return res?.hint ? `${res.error} — ${res.hint}` : (res?.error || fallback);
}

function adminLcInputStyle(theme, extra) {
  return {
    background: theme.surface, border: `1px solid ${theme.borderStrong}`, borderRadius: 10,
    padding: '9px 13px', fontSize: 13.5, color: theme.text, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box', ...extra,
  };
}

function AdminLcField({ theme, label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: theme.textDim, textTransform: 'uppercase',
      }}>{label}</span>
      {children}
    </div>
  );
}

// 화자 토글 — M 은 success, W 는 accent2(목업 .tog .m/.w). 값이 없으면 둘 다 꺼진 채로 둔다:
// 화면이 대신 골라 주면 "서버가 왜 거부했나" 와 어긋난다.
function AdminLcSpeakerToggle({ theme, index, value, error, onChange }) {
  const tone = { M: theme.success, W: theme.accent2 };
  return (
    <div
      data-testid={`lc-speaker-${index}`}
      data-speaker={value || ''}
      role="radiogroup"
      style={{
        display: 'flex', flexShrink: 0, borderRadius: 9, overflow: 'hidden',
        border: `1px solid ${error ? theme.error : theme.borderStrong}`,
      }}
    >
      {ADMIN_LC_SPEAKERS.map((s) => {
        const on = value === s;
        return (
          <button
            type="button"
            key={s}
            data-testid={`lc-speaker-${index}-${s}`}
            aria-pressed={on}
            title={s === 'M' ? '남성 화자' : '여성 화자'}
            onClick={() => onChange(s)}
            style={{
              padding: '8px 11px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', border: 'none',
              color: on ? tone[s] : theme.textDim,
              background: on ? adminLcTint(tone[s], '29', theme.chipBg) : 'transparent',
            }}
          >{s}</button>
        );
      })}
    </div>
  );
}

function AdminLcLine({ theme, index, line, error, canRemove, onChange, onRemove }) {
  return (
    <div data-testid={`lc-line-${index}`} data-error={error ? 'true' : undefined} style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 9,
    }}>
      <span style={{ width: 15, fontSize: 11, color: theme.textDim, textAlign: 'right', paddingTop: 10, flexShrink: 0 }}>
        {index + 1}
      </span>
      <AdminLcSpeakerToggle
        theme={theme} index={index} value={line.speaker} error={error && !line.speaker}
        onChange={(speaker) => onChange({ speaker })}
      />
      <textarea
        data-testid={`lc-text-${index}`}
        value={line.text}
        rows={2}
        placeholder="대사만 — 화자 라벨·괄호 지시문 없이"
        onChange={(e) => onChange({ text: e.target.value })}
        style={adminLcInputStyle(theme, {
          flex: 1, minWidth: 0, resize: 'vertical', fontSize: 12.5, lineHeight: 1.45, borderRadius: 9,
          border: `1px solid ${error ? theme.error : theme.border}`,
          background: error ? adminLcTint(theme.error, '0d', theme.card) : theme.card,
        })}
      />
      <button
        type="button"
        data-testid={`lc-remove-line-${index}`}
        title={canRemove ? '이 줄 삭제' : '마지막 줄은 지울 수 없습니다'}
        disabled={!canRemove}
        onClick={onRemove}
        style={{
          width: 30, height: 34, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center',
          border: `1px solid ${theme.border}`, background: 'transparent',
          color: theme.textDim, cursor: canRemove ? 'pointer' : 'not-allowed', opacity: canRemove ? 1 : 0.4,
        }}
      ><Icons.X size={14} /></button>
    </div>
  );
}

function AdminLcItem({ theme, index, item, error, onChange }) {
  const setOption = (id, text) => onChange({ options: item.options.map((o) => (o.id === id ? { ...o, text } : o)) });
  const small = (extra) => adminLcInputStyle(theme, { fontSize: 12, padding: '7px 11px', borderRadius: 8, ...extra });
  return (
    <div data-testid={`lc-item-${index}`} data-error={error ? 'true' : undefined} style={{
      border: `1px solid ${error ? theme.error : theme.border}`, borderRadius: 12,
      padding: '13px 14px', marginBottom: 10,
      background: error ? adminLcTint(theme.error, '0d', theme.card) : theme.card,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: theme.textDim, flexShrink: 0 }}>Q{index + 1}</span>
        <input
          data-testid={`lc-item-${index}-stem`}
          value={item.stem}
          placeholder="질문(stem)"
          onChange={(e) => onChange({ stem: e.target.value })}
          style={small({ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 12.5 })}
        />
      </div>
      {item.options.map((o) => {
        const correct = item.answer === o.id;
        return (
          <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
            <input
              type="radio"
              name={`lc-answer-${index}`}
              data-testid={`lc-item-${index}-answer-${o.id}`}
              checked={correct}
              onChange={() => onChange({ answer: o.id })}
              title="정답으로 지정"
              style={{ accentColor: theme.success, margin: 0, flexShrink: 0 }}
            />
            <span style={{ width: 24, fontSize: 11.5, fontWeight: 800, color: correct ? theme.success : theme.textDim, flexShrink: 0 }}>
              ({o.id})
            </span>
            <input
              data-testid={`lc-item-${index}-option-${o.id}`}
              value={o.text}
              placeholder={`보기 ${o.id}`}
              onChange={(e) => setOption(o.id, e.target.value)}
              style={small({
                flex: 1, minWidth: 0,
                color: correct ? theme.success : theme.text,
                border: `1px solid ${correct ? adminLcTint(theme.success, '4d', theme.borderStrong) : theme.border}`,
              })}
            />
          </label>
        );
      })}
      <div style={{ display: 'flex', gap: 10, marginTop: 11 }}>
        <textarea
          data-testid={`lc-item-${index}-explanation`}
          value={item.explanation}
          rows={2}
          placeholder="해설 — 정답 id 를 (B) 처럼 적는다"
          onChange={(e) => onChange({ explanation: e.target.value })}
          style={small({ flex: 1, minWidth: 0, resize: 'vertical', fontSize: 11.5, lineHeight: 1.5, borderRadius: 9 })}
        />
        <select
          data-testid={`lc-item-${index}-skill`}
          value={item.skill_code}
          onChange={(e) => onChange({ skill_code: e.target.value })}
          title="평가 영역(skill_code)"
          style={small({ width: 132, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5, borderRadius: 9 })}
        >
          <option value="">skill 없음</option>
          {ADMIN_LC_SKILLS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );
}

// 하단 빨간 띠 — 이 화면의 핵심이다. 422 의 validation_errors 를 한 줄씩 그대로 적고,
// `script[2].speaker` 같은 경로 접두만 code 로 구분해 준다. 문구를 고쳐 쓰지 않는다.
function AdminLcErrors({ theme, errors }) {
  const isValidation = errors.kind === 'validation';
  return (
    <div data-testid="lc-errors" role="alert" style={{
      borderRadius: 12, padding: '11px 15px', maxHeight: 150, overflowY: 'auto',
      background: adminLcTint(theme.error, '12', theme.chipBg),
      border: `1px solid ${adminLcTint(theme.error, '4d', theme.error)}`,
    }} className="jina-scroll">
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.error, marginBottom: 5 }}>
        ✕ 저장하지 않았습니다 — {isValidation
          ? `서버 검증 ${errors.list.length}건 (422 · validation_errors)`
          : (errors.code || '요청 실패')}
      </div>
      {isValidation ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12, color: theme.textMuted, lineHeight: 1.6 }}>
          {errors.list.map((e, i) => {
            const m = /^((?:script|items)\[\d+\](?:\.\w+)?)\s*/.exec(e);
            return (
              <li key={i} data-testid="lc-error">
                {m ? (
                  <React.Fragment>
                    <code style={{ fontFamily: 'ui-monospace, Consolas, monospace', color: theme.text, fontSize: 11.5 }}>{m[1]}</code>
                    {' — '}{e.slice(m[0].length)}
                  </React.Fragment>
                ) : e}
              </li>
            );
          })}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.6 }}>{errors.message}</div>
      )}
    </div>
  );
}

function AdminLcNeedAuthor({ theme, me }) {
  return (
    <div data-testid="lc-need-author" style={{
      padding: '48px 40px', textAlign: 'center', color: theme.textMuted, fontSize: 14, lineHeight: 1.8,
    }}>
      레슨 편집은 <b style={{ color: theme.accent }}>author</b> 이상만 할 수 있습니다.
      <div style={{ fontSize: 12.5, color: theme.textDim, marginTop: 6 }}>
        현재 역할: {me?.role || '—'} — 관리자에게 권한을 요청하세요.
      </div>
    </div>
  );
}

// 전역 진입점. admin-app.jsx 가 #/edit/lesson/:id · #/edit/lesson/new 에서 렌더한다.
// lessonId 가 없으면 빈 폼(신규 → POST, status 는 서버가 'draft' 로 명시), 있으면 불러와 PATCH.
function AdminLcEditor({ theme, me, lessonId }) {
  const [form, setForm] = React.useState(() => (lessonId == null ? adminLcBlankForm() : null));
  const [loading, setLoading] = React.useState(lessonId != null);
  const [loadError, setLoadError] = React.useState(null);
  const [reloadSeq, setReloadSeq] = React.useState(0);
  // 신규 폼이 한 번 저장되면 그 id 로 이어서 PATCH 한다 — 두 번째 저장이 두 번째 레슨을 만들지 않게.
  const [savedId, setSavedId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState(null);
  const [saved, setSaved] = React.useState(null);
  const [speaking, setSpeaking] = React.useState(false);
  const currentId = lessonId ?? savedId;

  React.useEffect(() => {
    setErrors(null);
    setSaved(null);
    setSavedId(null);
    if (lessonId == null) {
      setForm(adminLcBlankForm());
      setLoading(false);
      setLoadError(null);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setLoadError(null);
    setForm(null);
    (async () => {
      const res = await window.JINA_API.get(`/api/admin/contents/lesson/${encodeURIComponent(lessonId)}`);
      if (!alive) return;
      setLoading(false);
      const lesson = res.ok ? adminLcLessonOf(res) : null;
      if (lesson) setForm(adminLcFormFromServer(lesson));
      else setLoadError(res.ok ? '응답에 레슨 본문이 없습니다.' : adminLcRequestError(res, '레슨을 불러오지 못했습니다.'));
    })();
    return () => { alive = false; };
  }, [lessonId, reloadSeq]);

  // 페이지를 떠나도 TTS 가 이어 읽지 않게 한다.
  React.useEffect(() => () => {
    if (speaking) try { window.speechSynthesis?.cancel(); } catch { /* 무해 */ }
  }, [speaking]);

  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const setLine = (i, p) => setForm((f) => ({ ...f, script: f.script.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const addLine = () => setForm((f) => ({ ...f, script: [...f.script, { speaker: adminLcNextSpeaker(f.script), text: '' }] }));
  const removeLine = (i) => setForm((f) => ({ ...f, script: f.script.filter((_, j) => j !== i) }));
  const setItem = (i, p) => setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...p } : it)) }));

  // 라우팅 형식은 admin-app.jsx adminRouteFromHash 의 것이다. adminGoto 는 뒤에 로드되는 파일의 이름이라
  // 여기서는 해시를 직접 쓴다 — 클릭 시점에는 있겠지만 이 파일이 그 존재에 기대지 않게.
  // 검수 화면에서 '승인 전 수정' 으로 들어왔으면(#/edit/lesson/:id?from=review) 큐로 돌아간다 — 콘텐츠 목록으로
  // 튕기면 검수자가 문맥을 잃는다. 라우터는 '?' 뒤를 잘라내므로 이 쿼리는 라우팅에 영향이 없다.
  const back = () => {
    const from = new URLSearchParams(String(window.location.hash).split('?')[1] || '').get('from');
    window.location.hash = from === 'review' ? '#/review' : '#/contents';
  };

  const save = async () => {
    if (saving || !form) return;
    setSaving(true);
    setErrors(null);
    setSaved(null);
    const payload = adminLcPayload(form);
    const res = currentId == null
      ? await window.JINA_API.post('/api/admin/contents/lesson', payload)
      : await window.JINA_API.patch(`/api/admin/contents/lesson/${encodeURIComponent(currentId)}`, payload);
    setSaving(false);
    if (res.ok) {
      const lesson = adminLcLessonOf(res);
      const id = lesson?.id ?? res.id ?? currentId;
      // 서버가 items 까지 실은 전체 레슨을 돌려주면 그걸로 갈아끼운다(정규화된 값·바뀐 source 가 보인다).
      // 목록 DTO 모양(items 없음)이면 상태 필드만 받는다 — 방금 친 문항을 빈 폼으로 덮으면 안 된다.
      if (lesson && Array.isArray(lesson.items)) setForm(adminLcFormFromServer(lesson));
      else if (lesson) patch({ status: lesson.status ?? form.status, visibility: lesson.visibility ?? form.visibility, source: lesson.source ?? form.source });
      else if (currentId == null) patch({ status: 'draft' });
      if (currentId == null && id != null) {
        setSavedId(id);
        // hashchange 를 내지 않는 replaceState — 라우터가 다시 마운트해 방금 저장한 폼을 새로 불러오는 것을
        // 막는다. 새로고침하면 이 주소로 다시 열리므로 신규 폼이 중복 생성되지도 않는다.
        window.history.replaceState(null, '', `#/edit/lesson/${encodeURIComponent(id)}`);
      }
      setSaved({ id, created: currentId == null });
    } else if (Array.isArray(res.validation_errors) && res.validation_errors.length) {
      setErrors({ kind: 'validation', list: res.validation_errors.map(String) });
    } else {
      setErrors({ kind: 'request', code: res.code, message: adminLcRequestError(res, '저장 요청을 처리하지 못했습니다.') });
    }
  };

  // 재생은 브라우저 TTS(결정 3). 화자 라벨은 읽지 않는다 — listening.jsx 와 같은 규범. 대사만 줄바꿈으로 잇는다.
  // admin.html 이 speech.jsx 를 로드하지 않으면 jinaSpeak 가 없고, 그때는 버튼을 그리지 않는다.
  const canSpeak = typeof window.jinaSpeak === 'function' && form?.kind === 'toeic_lc';
  const speak = () => {
    if (speaking) { try { window.speechSynthesis?.cancel(); } catch { /* 무해 */ } setSpeaking(false); return; }
    const text = form.script.map((l) => l.text.trim()).filter(Boolean).join('\n');
    const ok = window.jinaSpeak(text, {
      rate: 0.95, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false),
    });
    if (!ok) setSpeaking(false);
  };

  if (!me?.can_author) return <AdminLcNeedAuthor theme={theme} me={me} />;

  const sec = {
    background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 15,
    padding: '16px 18px', minHeight: 0, overflowY: 'auto',
  };
  const secHead = { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 };
  const secTitle = { fontSize: 13.5, fontWeight: 700 };
  const secCount = { fontSize: 11, color: theme.textDim };
  const footNote = {
    marginTop: 14, paddingTop: 13, borderTop: `1px solid ${theme.border}`,
    fontSize: 11.5, color: theme.textDim, lineHeight: 1.65,
  };
  const ghostBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 16px', borderRadius: 12,
    background: 'transparent', border: `1px solid ${theme.borderStrong}`, color: theme.text,
    fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
  };
  const targets = adminLcErrorTargets(errors?.kind === 'validation' ? errors.list : null);
  const isLc = form?.kind === 'toeic_lc';
  const statusMeta = form ? (ADMIN_STATUS_META[form.status] || { label: form.status, tone: 'textMuted' }) : null;
  // 불러온 kind 가 셀렉트 목록에 없으면(toeic_part5) 그 값을 옵션으로 얹어 조용히 바뀌지 않게 한다.
  const kindOptions = form && !ADMIN_LC_KINDS.some((k) => k.key === form.kind)
    ? [...ADMIN_LC_KINDS, { key: form.kind, label: `${ADMIN_KIND_LABELS[form.kind] || '레슨'} · ${form.kind}` }]
    : ADMIN_LC_KINDS;
  const paragraphs = form && !isLc ? form.passageText.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;

  return (
    <div data-testid="lc-editor" data-lesson-id={currentId ?? 'new'} style={{
      display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
    }}>
      <style>{`@media (max-width: 900px) { .admin-lc-layout { grid-template-columns: 1fr !important; } }`}</style>

      {/* 메타 바 — 제목·부제·kind·난이도·예상 분·상태. 상태는 읽기 전용이다: 전이는 목록 화면의 [▾](플랜 11). */}
      <div style={{
        padding: '15px 26px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0,
        display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
      }}>
        <button
          type="button"
          data-testid="lc-back"
          onClick={back}
          title="콘텐츠 목록으로"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-end',
            padding: '9px 13px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${theme.borderStrong}`, color: theme.textMuted,
          }}
        ><Icons.ArrowLeft size={14} />목록</button>
        <AdminLcField theme={theme} label="제목">
          <input
            data-testid="lc-title"
            value={form?.title ?? ''}
            disabled={!form}
            placeholder="TOEIC LC — …"
            onChange={(e) => patch({ title: e.target.value })}
            style={adminLcInputStyle(theme, { width: 340, fontWeight: 600 })}
          />
        </AdminLcField>
        <AdminLcField theme={theme} label="부제">
          <input
            data-testid="lc-subtitle"
            value={form?.subtitle ?? ''}
            disabled={!form}
            placeholder="회의 일정 조율"
            onChange={(e) => patch({ subtitle: e.target.value })}
            style={adminLcInputStyle(theme, { width: 220 })}
          />
        </AdminLcField>
        <AdminLcField theme={theme} label="kind">
          <select
            data-testid="lc-kind"
            value={form?.kind ?? 'toeic_lc'}
            disabled={!form}
            onChange={(e) => {
              const next = e.target.value;
              const wasLc = form?.kind === 'toeic_lc';
              const isLc = next === 'toeic_lc';
              // LC ↔ 독해를 오가면 passage 껍데기(type·subject)는 다른 종류의 것이다 — 비워서 서버 기본값을 받게 한다.
              patch(wasLc === isLc ? { kind: next } : { kind: next, passageMeta: { type: '', subject: '' } });
            }}
            style={adminLcInputStyle(theme, { width: 168, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 })}
          >
            {kindOptions.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </AdminLcField>
        <AdminLcField theme={theme} label="난이도">
          <input
            data-testid="lc-difficulty"
            type="number" min={1} max={5}
            value={form?.difficulty ?? ''}
            disabled={!form}
            onChange={(e) => patch({ difficulty: e.target.value })}
            style={adminLcInputStyle(theme, { width: 78 })}
          />
        </AdminLcField>
        <AdminLcField theme={theme} label="예상 분">
          <input
            data-testid="lc-est-minutes"
            type="number" min={1} max={180}
            value={form?.est_minutes ?? ''}
            disabled={!form}
            onChange={(e) => patch({ est_minutes: e.target.value })}
            style={adminLcInputStyle(theme, { width: 78 })}
          />
        </AdminLcField>
        <AdminLcField theme={theme} label="상태">
          <span data-testid="lc-status" data-status={form?.status} style={adminLcInputStyle(theme, {
            display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 108,
            background: theme.card, borderStyle: 'dashed', fontSize: 12.5, fontWeight: 700,
            color: statusMeta ? (theme[statusMeta.tone] || theme.textMuted) : theme.textDim,
          })}>
            {statusMeta ? statusMeta.label : '—'}
            {form && (
              <span style={{ fontWeight: 600, color: theme.textDim }}>
                · {form.visibility === 'public' ? '공개' : '비공개'}{form.source ? ` · ${form.source}` : ''}
              </span>
            )}
          </span>
        </AdminLcField>
        <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 12, color: theme.textDim, lineHeight: 1.6 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
            플랜 13 Phase A · 최소형
          </div>
          {form?.source === 'seed'
            ? <span>시드 행 — 저장하면 source 가 <b style={{ color: theme.textMuted }}>curated</b> 로 바뀌어 재시드가 덮어쓰지 않는다</span>
            : currentId == null
              ? <span>새 레슨은 <b style={{ color: theme.textMuted }}>초안(draft)</b>으로 저장된다 — 공개는 목록의 전이로</span>
              : <span>AI 초안을 <b style={{ color: theme.textMuted }}>고치는</b> 화면 — 상태는 바꾸지 않는다</span>}
        </div>
      </div>

      {loading ? (
        <div data-testid="lc-loading" style={{ padding: '48px 40px', textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
          레슨을 불러오는 중…
        </div>
      ) : loadError ? (
        <div data-testid="lc-load-error" role="alert" style={{
          margin: '18px 26px', padding: '12px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
          background: adminLcTint(theme.error, '12', theme.chipBg), border: `1px solid ${adminLcTint(theme.error, '4d', theme.error)}`,
          color: theme.error, fontSize: 13, fontWeight: 600,
        }}>
          <span style={{ flex: 1 }}>{loadError}</span>
          <button type="button" onClick={() => setReloadSeq((n) => n + 1)} style={{
            padding: '6px 12px', borderRadius: 8, background: theme.error, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>재시도</button>
        </div>
      ) : (
        <main className="admin-lc-layout" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, padding: '18px 26px 0', flex: 1, minHeight: 0,
        }}>
          {/* 왼쪽: LC 는 화자 토글 스크립트, 그 외 kind 는 지문 본문 하나 */}
          <section className="jina-scroll" data-testid={isLc ? 'lc-script' : 'lc-passage-section'} style={sec}>
            {isLc ? (
              <React.Fragment>
                <div style={secHead}>
                  <span style={secTitle}>스크립트</span>
                  <span style={secCount}>{form.script.length}줄 · 규칙 4~8줄</span>
                  <button
                    type="button"
                    data-testid="lc-add-line"
                    onClick={addLine}
                    style={{
                      marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 11.5, color: theme.textMuted, cursor: 'pointer', background: 'transparent',
                      border: `1px solid ${theme.borderStrong}`, padding: '6px 11px', borderRadius: 9,
                    }}
                  ><Icons.Plus size={12} />줄 추가</button>
                </div>
                {form.script.map((line, i) => (
                  <AdminLcLine
                    key={i}
                    theme={theme}
                    index={i}
                    line={line}
                    error={targets.script.has(i)}
                    canRemove={form.script.length > 1}
                    onChange={(p) => setLine(i, p)}
                    onRemove={() => removeLine(i)}
                  />
                ))}
                <div style={footNote}>
                  재생은 <b style={{ color: theme.textMuted }}>jinaSpeak</b> 브라우저 TTS — 화자 라벨은 읽지 않는다(기존 규범).
                  {typeof window.jinaSpeak !== 'function' && ' 이 페이지에는 speech.jsx 가 로드되지 않아 미리듣기 버튼이 없다.'}
                  <br />오디오 파일 업로드는 범위 밖(결정 3) — 파일 저장소가 없다.
                </div>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div style={secHead}>
                  <span style={secTitle}>지문</span>
                  <span style={secCount}>{paragraphs}문단 · 빈 줄이 문단 경계</span>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <AdminLcField theme={theme} label="지문 종류(type)" style={{ width: 150 }}>
                    <input
                      data-testid="lc-passage-type"
                      value={form.passageMeta.type ?? ''}
                      placeholder="EMAIL · NOTICE · ARTICLE"
                      onChange={(e) => patch({ passageMeta: { ...form.passageMeta, type: e.target.value } })}
                      style={adminLcInputStyle(theme, { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 })}
                    />
                  </AdminLcField>
                  <AdminLcField theme={theme} label="지문 제목(subject)" style={{ flex: 1 }}>
                    <input
                      data-testid="lc-passage-subject"
                      value={form.passageMeta.subject ?? ''}
                      onChange={(e) => patch({ passageMeta: { ...form.passageMeta, subject: e.target.value } })}
                      style={adminLcInputStyle(theme, { fontSize: 12.5 })}
                    />
                  </AdminLcField>
                </div>
                <textarea
                  data-testid="lc-passage"
                  value={form.passageText}
                  rows={16}
                  placeholder={'Dear team,\n\n첫 문단…\n\n둘째 문단…'}
                  onChange={(e) => patch({ passageText: e.target.value })}
                  style={adminLcInputStyle(theme, {
                    width: '100%', resize: 'vertical', fontSize: 12.5, lineHeight: 1.55, background: theme.card,
                    border: `1px solid ${theme.border}`,
                  })}
                />
                <div style={footNote}>
                  Part 7 도 <b style={{ color: theme.textMuted }}>같은 폼</b>이다 — 지문이 줄 배열 대신 본문 하나(별도 에디터 없음).
                  from·to·cc·date 같은 이메일 머리 필드와 어휘(vocab {form.vocab.length})·FAQ({form.faq.length})는
                  불러온 값을 그대로 보존해 저장한다 — 이 화면은 그것들을 편집하지 않는다.
                </div>
              </React.Fragment>
            )}
          </section>

          {/* 오른쪽: 문항. 추가/삭제 없음(§0) — 개수는 불러온 그대로, 신규는 3. */}
          <section className="jina-scroll" data-testid="lc-items" style={sec}>
            <div style={secHead}>
              <span style={secTitle}>문항</span>
              <span style={secCount}>{form.items.length}개 · 4지선다 · 추가/삭제는 최소형 범위 밖</span>
            </div>
            {form.items.map((item, i) => (
              <AdminLcItem
                key={i}
                theme={theme}
                index={i}
                item={item}
                error={targets.items.has(i)}
                onChange={(p) => setItem(i, p)}
              />
            ))}
          </section>
        </main>
      )}

      {/* 하단 바 — 오류 띠 · 성공 안내 · 미리듣기 · 저장 */}
      <div style={{
        padding: '16px 26px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        borderTop: `1px solid ${theme.border}`,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {errors ? <AdminLcErrors theme={theme} errors={errors} /> : saved ? (
            <div data-testid="lc-saved" role="status" style={{
              borderRadius: 12, padding: '11px 15px', display: 'flex', alignItems: 'center', gap: 12,
              background: adminLcTint(theme.success, '14', theme.chipBg),
              border: `1px solid ${adminLcTint(theme.success, '55', theme.success)}`,
            }}>
              <span style={{ flex: 1, fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6 }}>
                <b style={{ color: theme.success }}>✓ 저장했습니다</b> — lesson#{saved.id}
                {saved.created ? ' · 초안(draft)으로 만들었습니다. 공개는 목록의 전이로 이어 갑니다.' : ' · 상태는 바꾸지 않았습니다.'}
              </span>
              <button type="button" data-testid="lc-back-to-list" onClick={back} style={{
                padding: '7px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                background: theme.chipBg, border: `1px solid ${theme.borderStrong}`, color: theme.text, flexShrink: 0,
              }}>목록으로 돌아가기</button>
            </div>
          ) : (
            <span style={{ fontSize: 11.5, color: theme.textDim, lineHeight: 1.65 }}>
              저장하면 서버가 <b style={{ color: theme.textMuted }}>validateGeneratedLesson</b> 을 돌리고,
              걸리면 422 의 validation_errors 가 여기에 그대로 뜬다 — 화면은 규칙을 다시 판단하지 않는다(결정 2).
            </span>
          )}
        </div>
        {canSpeak && (
          <button type="button" data-testid="lc-tts" onClick={speak} aria-pressed={speaking} style={{
            ...ghostBtn, color: speaking ? theme.accent : theme.text,
            borderColor: speaking ? theme.accent : theme.borderStrong, flexShrink: 0,
          }}>
            {speaking ? <Icons.Pause size={14} /> : <Icons.Play size={14} />}
            {speaking ? '멈추기' : '스크립트 미리듣기'}
          </button>
        )}
        <button
          type="button"
          data-testid="lc-save"
          disabled={saving || !form}
          onClick={save}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 22px', borderRadius: 12,
            background: theme.accent, color: '#fff', fontSize: 13.5, fontWeight: 700, flexShrink: 0,
            cursor: saving || !form ? 'wait' : 'pointer', opacity: saving || !form ? 0.6 : 1,
          }}
        ><Icons.Check size={14} />{saving ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  );
}

window.AdminLcEditor = AdminLcEditor;

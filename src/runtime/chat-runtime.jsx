// chat-runtime.jsx — Live AI chat state + input bar that wires to JINA_AI

// useJinaChat — manages a live message list that calls the configured AI provider
function useJinaChat(initialMessages = []) {
  const [messages, setMessages] = React.useState(initialMessages);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const reset = React.useCallback((msgs = []) => {
    setMessages(msgs);
    setLoading(false);
    setError(null);
  }, []);

  const send = React.useCallback(async (text) => {
    if (!text || !text.trim() || loading) return;
    const userMsg = { role: 'user', kind: 'user-text', content: text.trim(), time: nowHHMM() };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    setError(null);
    // History only — strip "kind" / "time"
    const hist = [...messages, userMsg]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.contentForModel || m.content }));
    const res = await window.JINA_AI.askJina({ history: hist.slice(0, -1), userMessage: text.trim() });
    setLoading(false);
    if (!res.ok) {
      setError(res.error || '응답 실패');
      setMessages((m) => [...m, {
        role: 'assistant', kind: 'jina-error',
        content: res.error, hint: res.hint || null, provider: res.provider, time: nowHHMM(),
      }]);
      return;
    }
    const d = res.data || {};
    setMessages((m) => [...m, {
      role: 'assistant', kind: 'jina-ai',
      contentForModel: d.reply_en || '',
      reply_en: d.reply_en || '(응답 없음)',
      reply_ko: d.reply_ko || null,
      corrections: d.corrections || [],
      scores: d.scores || null,
      suggestion: d.suggestion || null,
      provider: res.provider,
      time: nowHHMM(),
    }]);
  }, [messages, loading]);

  return { messages, loading, error, send, reset };
}

function nowHHMM(date) {
  const d = date ? new Date(date) : new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
window.jinaHHMM = nowHHMM; // conversation-store 매퍼가 재사용 — 시각 포맷터 중복 구현 금지

// JinaInputBar — text-input bar that calls onSend; falls back to mic mode visually
function JinaInputBar({ theme, onSend, loading, suggestions, provider, modelInfo, compact = false }) {
  const [text, setText] = React.useState('');
  const [mode, setMode] = React.useState('text'); // 'text' | 'mic'
  const ref = React.useRef(null);
  const submit = () => {
    if (!text.trim() || loading) return;
    onSend(text.trim());
    setText('');
    setTimeout(() => ref.current?.focus(), 50);
  };
  return (
    <div style={{
      padding: compact ? '12px 14px 18px' : '18px 28px 24px',
      borderTop: `1px solid ${theme.border}`,
      background: theme.bg,
    }}>
      {/* Provider badge — 5종 공통 (PROVIDER_META) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10.5, padding: '3px 8px', borderRadius: 999,
          background: (window.JINA_AI.PROVIDER_META[provider]?.color || '#888') + '22',
          color: window.JINA_AI.PROVIDER_META[provider]?.color || '#888',
          fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
          {`${window.JINA_AI.PROVIDER_META[provider]?.label || provider} · ${modelInfo}`}
        </span>
        <div style={{ display: 'inline-flex', borderRadius: 8, background: theme.chipBg, padding: 2 }}>
          {['text', 'mic'].map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '4px 10px', borderRadius: 6,
              background: mode === m ? theme.bg : 'transparent',
              color: mode === m ? theme.text : theme.textMuted,
              fontSize: 11, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {m === 'text' ? <Icons.Chat size={11} /> : <Icons.Mic size={11} />}
              {m === 'text' ? '텍스트' : '음성'}
            </button>
          ))}
        </div>
        {loading && (
          <span style={{ fontSize: 11, color: theme.textMuted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.accent, animation: 'jina-pulse 1s infinite' }} />
            Jina가 응답 중…
          </span>
        )}
      </div>

      {mode === 'mic' ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderRadius: 16,
          background: theme.card, border: `1px solid ${theme.borderStrong}`,
          boxShadow: theme.shadow,
        }}>
          <button style={{
            width: 44, height: 44, borderRadius: '50%',
            background: theme.accentGrad, color: '#fff',
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
            boxShadow: `0 6px 20px -6px ${theme.accent}80`,
            position: 'relative',
          }}>
            <span style={{
              position: 'absolute', inset: -4, borderRadius: '50%',
              border: `2px solid ${theme.accent}`, opacity: 0.4,
              animation: 'jina-pulse 1.5s ease-in-out infinite',
            }} />
            <Icons.Mic size={18} stroke={2.2} />
          </button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Waveform theme={theme} active height={28} bars={28} />
            <span style={{ fontSize: 11, color: theme.textMuted }}>음성 모드는 데모예요 — 텍스트로 전환해 실제 AI와 대화해보세요</span>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 10,
          padding: '10px 12px', borderRadius: 16,
          background: theme.card, border: `1px solid ${theme.borderStrong}`,
          boxShadow: theme.shadow,
        }}>
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            rows={1}
            placeholder="Jina에게 영어로 말을 걸어보세요…  (Enter = 전송, Shift+Enter = 줄바꿈)"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: theme.text, fontSize: 14, lineHeight: 1.5, padding: '8px 4px',
              resize: 'none', minHeight: 28, maxHeight: 120,
              fontFamily: 'inherit',
            }}
          />
          <button onClick={submit} disabled={!text.trim() || loading} style={{
            padding: '9px 14px', borderRadius: 10,
            background: !text.trim() || loading ? theme.chipBg : theme.text,
            color: !text.trim() || loading ? theme.textMuted : theme.bg,
            fontSize: 12, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            cursor: !text.trim() || loading ? 'not-allowed' : 'pointer',
            transition: 'all .15s',
          }}>
            전송 <Icons.Send size={13} />
          </button>
        </div>
      )}

      {!compact && suggestions && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: theme.textDim }}>빠른 응답</span>
          {suggestions.map((q, i) => (
            <button key={i} onClick={() => onSend(q)} style={{
              padding: '6px 10px', borderRadius: 999,
              background: theme.chipBg, color: theme.textMuted,
              fontSize: 11.5, fontStyle: 'italic',
            }}>{q}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Live AI message bubble — renders parsed JSON response
function LiveJinaMessage({ theme, msg, compact = false }) {
  if (msg.kind === 'jina-error') {
    return (
      <div style={{ display: 'flex', gap: compact ? 8 : 12 }}>
        <JinaAvatar size={compact ? 28 : 36} theme={theme} />
        <div style={{ flex: 1, maxWidth: 600 }}>
          <div style={{
            padding: '12px 14px', borderRadius: 14, borderTopLeftRadius: 4,
            background: theme.error + '15', border: `1px solid ${theme.error}40`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.error, marginBottom: 4 }}>
              ⚠︎ {(window.JINA_AI.PROVIDER_META[msg.provider]?.label || msg.provider || 'AI')} 호출 실패
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
              {msg.content}
            </div>
            {/* 해결법은 서버가 준 hint가 있을 때만 — 프론트 provider 분기 0 */}
            {msg.hint && (
              <div style={{ fontSize: 11, color: theme.textDim, marginTop: 8, padding: 8, borderRadius: 6, background: theme.bgSoft }}>
                <b style={{ color: theme.text }}>해결법:</b> {msg.hint}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: compact ? 8 : 12, animation: 'jina-rise .3s ease-out' }}>
      <JinaAvatar size={compact ? 28 : 36} theme={theme} />
      <div style={{ flex: 1, maxWidth: 620 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span className="jina-serif" style={{ fontSize: compact ? 14 : 15, fontStyle: 'italic', color: theme.text, fontWeight: 500 }}>Jina</span>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: theme.accent + '20', color: theme.accent, fontWeight: 700, letterSpacing: '0.04em' }}>
            {(window.JINA_AI.PROVIDER_META[msg.provider]?.label || msg.provider || '').toUpperCase()}
          </span>
          <span style={{ fontSize: 10.5, color: theme.textDim }}>{msg.time}</span>
        </div>
        <div style={{
          padding: compact ? '11px 13px' : '14px 16px', borderRadius: 16, borderTopLeftRadius: 4,
          background: theme.chipBg, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ fontSize: compact ? 13.5 : 14.5, color: theme.text, lineHeight: 1.55 }}>
            {msg.reply_en}
          </div>
          {msg.reply_ko && (
            <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5, marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${theme.border}` }}>
              {msg.reply_ko}
            </div>
          )}
          {msg.scores && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {Object.entries(msg.scores).map(([k, v]) => (
                <div key={k} style={{
                  fontSize: 10.5, padding: '3px 8px', borderRadius: 999,
                  background: theme.surface, border: `1px solid ${theme.border}`,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ color: theme.textMuted }}>{k}</span>
                  <span style={{ color: v >= 80 ? theme.success : v >= 60 ? theme.warning : theme.error, fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {msg.corrections && msg.corrections.length > 0 && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Icons.Sparkles size={13} style={{ color: theme.accent }} />
              <span style={{ fontSize: 11, color: theme.text, fontWeight: 700, letterSpacing: '0.04em' }}>첨삭 ({msg.corrections.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {msg.corrections.map((c, i) => (
                <div key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ textDecoration: 'line-through', color: theme.error }}>{c.original}</span>
                    <Icons.ArrowRight size={11} style={{ color: theme.textDim }} />
                    <span style={{ background: theme.success + '22', color: theme.success, padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>{c.corrected}</span>
                    {c.type && <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 3, background: theme.chipBg, color: theme.textMuted, fontWeight: 600 }}>{c.type}</span>}
                  </div>
                  {c.reason && <div style={{ color: theme.textMuted, marginTop: 3 }}>{c.reason}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {msg.suggestion && (
          <div style={{ marginTop: 8, fontSize: 12, color: theme.textMuted, fontStyle: 'italic', padding: '4px 12px' }}>
            💡 {msg.suggestion}
          </div>
        )}
      </div>
    </div>
  );
}

// Live user message — text only (typed)
function LiveUserMessage({ theme, msg, compact = false }) {
  return (
    <div style={{ display: 'flex', gap: compact ? 8 : 12, flexDirection: 'row-reverse', animation: 'jina-rise .3s ease-out' }}>
      <div style={{
        width: compact ? 28 : 36, height: compact ? 28 : 36, borderRadius: '50%', flex: '0 0 auto',
        background: `linear-gradient(135deg, ${theme.accent2}, ${theme.accent3})`,
        display: 'grid', placeItems: 'center', color: '#fff', fontSize: compact ? 12 : 14, fontWeight: 600,
      }}>수</div>
      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 10.5, color: theme.textDim, marginBottom: 5 }}>{msg.time} · You</div>
        <div style={{
          padding: compact ? '10px 13px' : '12px 16px', borderRadius: 16, borderTopRightRadius: 4,
          background: theme.accentGradSoft, border: `1px solid ${theme.border}`,
          fontSize: compact ? 13.5 : 14.5, color: theme.text, lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
        }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

window.useJinaChat = useJinaChat;
window.JinaInputBar = JinaInputBar;
window.LiveJinaMessage = LiveJinaMessage;
window.LiveUserMessage = LiveUserMessage;

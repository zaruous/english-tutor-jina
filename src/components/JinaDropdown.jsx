// JinaDropdown.jsx — Jina 공통 드롭다운
//
// JinaDropdown   — 패널 shell(위치·닫기·trigger). 메뉴·케밥용.
// JinaCodeSelect — 서버 code lookup + 옵션 자동 렌더. 역할 등 기준정보용.
//
//   anchor='fixed'|'absolute'  — transform 조상(모달) 안은 absolute.
//   lookup='roles'             — GET /api/codes/:key (api/lib/code-lookup.js)

const JINA_DROPDOWN_MAX = 280;
const jinaCodeCache = {};

function jinaCodeItemKey(item) {
  return item?.code ?? item?.value ?? item?.id;
}

function jinaCodeItemLabel(item) {
  return item?.name ?? item?.label ?? jinaCodeItemKey(item) ?? '—';
}

function invalidateJinaCodeCache(key) {
  if (key) delete jinaCodeCache[key];
  else Object.keys(jinaCodeCache).forEach((k) => delete jinaCodeCache[k]);
}

function useJinaCodeLookup(lookup, { items: seed } = {}) {
  const seeded = Array.isArray(seed) && seed.length > 0;
  const [state, setState] = React.useState(() => ({
    loading: Boolean(lookup && !seeded && !jinaCodeCache[lookup]),
    items: seeded ? seed : (lookup && jinaCodeCache[lookup]) || [],
    error: null,
  }));

  React.useEffect(() => {
    if (seeded) {
      setState({ loading: false, items: seed, error: null });
      return undefined;
    }
    if (!lookup) return undefined;
    if (jinaCodeCache[lookup]) {
      setState({ loading: false, items: jinaCodeCache[lookup], error: null });
      return undefined;
    }
    let cancelled = false;
    setState((p) => ({ ...p, loading: true, error: null }));
    window.JINA_API.get(`/api/codes/${encodeURIComponent(lookup)}`).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        jinaCodeCache[lookup] = res.items || [];
        setState({ loading: false, items: res.items || [], error: null });
      } else {
        setState({ loading: false, items: [], error: res.error || '코드 목록을 불러오지 못했습니다.' });
      }
    });
    return () => { cancelled = true; };
  }, [lookup, seeded, seed]);

  return state;
}

function useJinaDismiss(open, setOpen, ref) {
  React.useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const dismiss = () => setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open, setOpen, ref]);
}

function jinaMenuPlacement(el, {
  anchor = 'fixed',
  align = 'left',
  width,
  minWidth = 160,
  maxHeight = JINA_DROPDOWN_MAX,
  minMaxHeight = 120,
  clampLeft = false,
} = {}) {
  const r = el.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - 8;
  const above = r.top - 8;
  const dropUp = below < Math.min(maxHeight, above) && above > below;
  const maxH = Math.max(minMaxHeight, dropUp ? above : below);

  if (anchor === 'absolute') {
    return { anchor, align, dropUp, maxHeight: maxH };
  }

  const w = width ?? Math.max(r.width, minWidth);
  const base = {
    anchor: 'fixed',
    align,
    dropUp,
    maxHeight: Math.max(minMaxHeight, Math.min(maxHeight, maxH)),
    width: w,
    top: r.bottom + 4,
    bottom: window.innerHeight - r.top + 4,
  };

  if (align === 'right') {
    return { ...base, right: Math.max(8, window.innerWidth - r.right) };
  }

  const left = clampLeft
    ? Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
    : r.left;
  return { ...base, left };
}

function jinaDropdownPanelStyle(theme, placement, { zIndex = 200, menuStyle } = {}) {
  if (!placement) return {};
  const shell = {
    background: theme.surfaceElev,
    border: `1px solid ${theme.borderStrong}`,
    borderRadius: 12,
    boxShadow: theme.shadow,
    padding: 6,
    maxHeight: placement.maxHeight,
    overflowY: 'auto',
    zIndex,
    ...menuStyle,
  };

  if (placement.anchor === 'absolute') {
    const stretch = placement.align === 'stretch';
    return {
      position: 'absolute',
      ...shell,
      ...(stretch ? { left: 0, right: 0 } : {}),
      ...(placement.dropUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
    };
  }

  return {
    position: 'fixed',
    ...shell,
    width: placement.width,
    ...(placement.align === 'right'
      ? { right: placement.right }
      : { left: placement.left }),
    ...(placement.dropUp ? { bottom: placement.bottom } : { top: placement.top }),
  };
}

// shell — renderTrigger + children(또는 render fn). code lookup 은 JinaCodeSelect 가 담당한다.
function JinaDropdown({
  theme,
  anchor = 'fixed',
  align = 'left',
  width,
  minWidth = 160,
  maxHeight = JINA_DROPDOWN_MAX,
  clampLeft = false,
  zIndex = 200,
  disabled = false,
  menuTestId,
  menuClassName = 'jina-scroll',
  menuStyle,
  renderTrigger,
  children,
}) {
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState(null);
  const ref = React.useRef(null);

  useJinaDismiss(open, setOpen, ref);

  const toggle = React.useCallback((e) => {
    if (disabled) return;
    const next = !open;
    if (next && e?.currentTarget) {
      setPlacement(jinaMenuPlacement(e.currentTarget, {
        anchor, align, width, minWidth, maxHeight, clampLeft,
      }));
    }
    setOpen(next);
  }, [disabled, open, anchor, align, width, minWidth, maxHeight, clampLeft]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {renderTrigger({ open, toggle, close, disabled })}
      {open && (
        <div
          data-testid={menuTestId}
          className={menuClassName}
          style={jinaDropdownPanelStyle(theme, placement, { zIndex, menuStyle })}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}

function jinaCodeOption(theme, item, {
  selected, close, onChange, busy, optionColor, showDescription,
}) {
  const code = jinaCodeItemKey(item);
  const dot = optionColor ? optionColor(code, item) : theme.text;
  return (
    <button
      key={code}
      type="button"
      disabled={selected || busy}
      onClick={() => { close(); onChange(code, item); }}
      style={{
        width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 9,
        display: 'flex', gap: 10, alignItems: 'flex-start',
        cursor: selected ? 'default' : 'pointer',
        background: selected ? theme.chipBg : 'transparent', border: 'none', color: theme.text,
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: dot, marginTop: 5, flexShrink: 0,
      }} />
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 12.5, fontWeight: 700,
          color: selected ? theme.accent : theme.text,
        }}>
          {jinaCodeItemLabel(item)}{selected ? ' — 현재' : ''}
        </span>
        {showDescription && item.description && (
          <span style={{
            display: 'block', fontSize: 11, color: theme.textDim, lineHeight: 1.5, marginTop: 2,
          }}>{item.description}</span>
        )}
      </span>
    </button>
  );
}

function jinaCodeTrigger(theme, {
  open, toggle, disabled, value, selectedItem, optionColor, variant, triggerTestId,
}) {
  const dot = optionColor ? optionColor(value) : theme.text;
  const field = variant === 'field';
  return (
    <button
      type="button"
      data-testid={triggerTestId}
      disabled={disabled}
      onClick={toggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box',
        padding: field ? '9px 12px' : '7px 11px',
        borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${open ? theme.accent + '99' : theme.borderStrong}`,
        background: open ? theme.accent + '17' : (field ? theme.card : 'transparent'),
        fontSize: field ? 13 : 12.5, fontWeight: 700, color: dot,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span style={{ flex: 1, textAlign: 'left' }}>{selectedItem ? jinaCodeItemLabel(selectedItem) : value}</span>
      <span style={{ fontSize: 10, color: theme.textDim }}>{open ? '▲' : '▼'}</span>
    </button>
  );
}

// lookup + value + onChange — 역할 등 DB 기준정보 선택. placement 는 필요할 때만 넘긴다.
function JinaCodeSelect({
  theme,
  lookup,
  items: seed,
  value,
  onChange,
  optionColor,
  showDescription = true,
  disabled = false,
  variant = 'inline',
  triggerTestId,
  menuTestId,
  anchor = 'fixed',
  align = 'left',
  minWidth = 240,
  maxHeight = 260,
}) {
  const { items, loading, error } = useJinaCodeLookup(lookup, { items: seed });
  const selectedItem = items.find((it) => jinaCodeItemKey(it) === value);

  return (
    <JinaDropdown
      theme={theme}
      anchor={anchor}
      align={align}
      minWidth={minWidth}
      maxHeight={maxHeight}
      disabled={disabled || loading}
      menuTestId={menuTestId}
      renderTrigger={(ctx) => jinaCodeTrigger(theme, {
        ...ctx, value, selectedItem, optionColor, variant, triggerTestId,
      })}
    >
      {({ close }) => {
        if (loading) {
          return <div style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textDim }}>불러오는 중…</div>;
        }
        if (error) {
          return <div style={{ padding: '12px 14px', fontSize: 12.5, color: theme.error }}>{error}</div>;
        }
        if (items.length === 0) {
          return <div style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textDim }}>항목이 없습니다</div>;
        }
        return items.map((item) => jinaCodeOption(theme, item, {
          selected: jinaCodeItemKey(item) === value,
          close,
          onChange,
          busy: disabled,
          optionColor,
          showDescription,
        }));
      }}
    </JinaDropdown>
  );
}

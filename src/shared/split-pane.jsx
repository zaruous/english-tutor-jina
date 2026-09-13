// split-pane.jsx — horizontal resizable split between two panes

function SplitPane({
  left,
  right,
  theme,
  initialRatio = 0.55,
  minLeft = 280,
  minRight = 320,
}) {
  const containerRef = React.useRef(null);
  const dragging = React.useRef(false);
  const [ratio, setRatio] = React.useState(initialRatio);
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);

  const clampRatio = React.useCallback((next) => {
    const el = containerRef.current;
    if (!el) return next;
    const w = el.getBoundingClientRect().width;
    if (w <= 0) return next;
    const minL = minLeft / w;
    const maxL = 1 - minRight / w;
    if (minL >= maxL) return 0.5;
    return Math.min(maxL, Math.max(minL, next));
  }, [minLeft, minRight]);

  const onPointerDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setRatio(clampRatio((e.clientX - rect.left) / rect.width));
  };

  const endDrag = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    setActive(false);
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  React.useEffect(() => {
    const onResize = () => setRatio((r) => clampRatio(r));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampRatio]);

  React.useEffect(() => {
    if (theme) syncJinaUiChrome(theme);
  }, [theme]);

  const handleClass = [
    'jina-split-handle',
    hover && 'is-hover',
    active && 'is-active',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        minHeight: 0,
        minWidth: 0,
        userSelect: active ? 'none' : undefined,
        cursor: active ? 'col-resize' : undefined,
      }}
    >
      <div style={{
        width: `${ratio * 100}%`,
        minWidth: minLeft,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={handleClass}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="jina-split-handle__grip" aria-hidden="true" />
      </div>
      <div style={{
        flex: 1,
        minWidth: minRight,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {right}
      </div>
    </div>
  );
}

window.SplitPane = SplitPane;

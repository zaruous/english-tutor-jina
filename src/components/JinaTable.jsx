// JinaTable.jsx — 관리자·목록형 grid 표 shell
//
// JinaTable         — 스크롤·테두리 컨테이너 (jina-scroll)
// JinaTableHead     — sticky 헤더 행
// JinaTableRow      — 데이터 행
// JinaTableSkeleton — 로딩 스켈레톤
// JinaTableEmpty    — 빈 목록
// JinaTableFooter   — '더 보기' 등 하단 액션

const JINA_TABLE_GAP = 14;
const JINA_TABLE_PAD = '0 18px';

function jinaTableColCount(columns) {
  return String(columns || '').trim().split(/\s+/).filter(Boolean).length || 1;
}

function JinaTable({
  theme,
  children,
  testId,
  margin = '0 26px',
  style,
}) {
  return (
    <div
      className="jina-scroll"
      data-testid={testId}
      style={{
        margin,
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        border: `1px solid ${theme.border}`,
        borderRadius: 15,
        background: theme.surface,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function JinaTableHead({ theme, columns, children, style }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        alignItems: 'center',
        gap: JINA_TABLE_GAP,
        padding: JINA_TABLE_PAD,
        height: 40,
        background: theme.bgSoft,
        borderRadius: '14px 14px 0 0',
        fontSize: 10.5,
        color: theme.textDim,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        position: 'sticky',
        top: 0,
        zIndex: 1,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function JinaTableRow({
  theme,
  columns,
  children,
  rowHeight = 62,
  borderTop = true,
  testId,
  style,
  ...rest
}) {
  return (
    <div
      data-testid={testId}
      {...rest}
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        alignItems: 'center',
        gap: JINA_TABLE_GAP,
        padding: JINA_TABLE_PAD,
        height: rowHeight,
        borderTop: borderTop ? `1px solid ${theme.border}` : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function JinaTableSkeleton({
  theme,
  columns,
  rows = 3,
  rowHeight = 62,
  testId = 'table-skeleton',
  colCount,
}) {
  const n = colCount ?? jinaTableColCount(columns);
  return (
    <div data-testid={testId}>
      {Array.from({ length: rows }, (_, i) => (
        <JinaTableRow
          key={i}
          theme={theme}
          columns={columns}
          rowHeight={rowHeight}
          borderTop={i > 0}
        >
          {Array.from({ length: n }, (_, c) => (
            <div
              key={c}
              style={{
                height: 14,
                borderRadius: 6,
                background: theme.chipBg,
                animation: 'jina-pulse 1.2s infinite',
              }}
            />
          ))}
        </JinaTableRow>
      ))}
    </div>
  );
}

function JinaTableEmpty({
  theme,
  children,
  testId = 'table-empty',
  padding = 40,
  style,
}) {
  return (
    <div
      data-testid={testId}
      style={{
        padding,
        textAlign: 'center',
        color: theme.textMuted,
        fontSize: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function JinaTableFooter({ theme, children, style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '14px 18px',
        borderTop: `1px solid ${theme.border}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

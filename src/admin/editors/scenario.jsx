// AdminScenarioEditor — 플랜 14 Phase D 구현 전 스텁. 라우팅·로드 순서가 먼저 동작하게 두는 자리 표시자다.
// 실제 구현이 이 파일을 통째로 덮어쓴다. 전역 이름 규칙은 content-store.jsx 머리말 참조.
function AdminScenarioEditor({ theme }) {
  return (
    <div data-testid="admin-stub-screen" data-file="회화 편집기" style={{ padding: '48px 40px', textAlign: 'center', color: theme.textDim, fontSize: 13.5, lineHeight: 1.8 }}>
      회화 편집기 는 플랜 14 Phase D 에서 구현됩니다.
    </div>
  );
}
window.AdminScenarioEditor = AdminScenarioEditor;

// ai-draft.jsx — 플랜 14 Phase B 구현 전 스텁. review-queue.jsx 가 렌더 시점에 typeof 로 확인해 그린다.
// 실제 구현이 이 파일을 통째로 덮어쓴다. 전역 이름 규칙(AdminAiDraft/adminAiDraft/ADMIN_AI_DRAFT_)은 content-store.jsx 머리말 참조.
function AdminAiDraftPanel({ theme }) {
  return (
    <div data-testid="admin-stub-screen" data-file="AI 초안 요청" style={{ padding: '14px 26px', color: theme.textDim, fontSize: 13 }}>
      AI 초안 요청 패널은 플랜 14 Phase B 에서 구현됩니다.
    </div>
  );
}
window.AdminAiDraftPanel = AdminAiDraftPanel;

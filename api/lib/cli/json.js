// 느슨한 JSON 추출 (ai-provider.jsx extractJson 이관 + 균형괄호 스캐너 추가).
// 기존 lastIndexOf('}') 휴리스틱은 모델이 JSON 뒤에 '}'가 든 프로즈를 붙이면
// 깨진다(실측: agy가 정확히 "프로즈 → JSON → 개행"을 낸다). 문자열/이스케이프
// 상태를 추적하며 첫 완결 객체만 잘라내는 스캐너를 3.5단계로 넣는다.

// raw에서 첫 번째로 완결되는 최상위 JSON 객체 텍스트를 찾아 파싱한다.
export function scanBalancedObject(raw) {
  let start = raw.indexOf('{');
  while (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(raw.slice(start, i + 1)); } catch { break; }
        }
      }
    }
    start = raw.indexOf('{', start + 1);
  }
  return null;
}

export function extractJson(raw) {
  if (!raw) return null;
  // 1) 직접
  try { return JSON.parse(raw); } catch { /* 다음 */ }
  // 2) 코드펜스
  const fence = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fence) {
    try { return JSON.parse(fence[1]); } catch { /* 다음 */ }
  }
  // 3.5) 균형괄호 스캐너 — 첫 완결 객체
  const scanned = scanBalancedObject(raw);
  if (scanned) return scanned;
  // 4) 구식 first { … last } (스캐너가 못 잡는 잘린 출력 대비 최후 폴백)
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* 실패 */ }
  }
  return null;
}

// JSON Schema 정의 — 3곳에서 재사용: agy --json-schema 값, ollama format 값,
// 프롬프트 계약 삽입 텍스트.
export const TUTOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply_en: { type: 'string', description: '자연스러운 영어 응답 (1-3 문장)' },
    reply_ko: { type: ['string', 'null'], description: '한국어 간단 요약 (선택)' },
    corrections: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          original: { type: 'string' },
          corrected: { type: 'string' },
          reason: { type: 'string', description: '짧은 한국어 설명' },
          type: { type: 'string', enum: ['grammar', 'usage', 'spelling'] },
        },
        required: ['original', 'corrected', 'reason', 'type'],
      },
    },
    scores: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        grammar: { type: 'integer', minimum: 0, maximum: 100 },
        fluency: { type: 'integer', minimum: 0, maximum: 100 },
        vocabulary: { type: 'integer', minimum: 0, maximum: 100 },
      },
      required: ['grammar', 'fluency', 'vocabulary'],
    },
    suggestion: { type: ['string', 'null'], description: '다음에 시도해볼 표현/질문 (한국어)' },
  },
  required: ['reply_en', 'corrections'],
};

export const VOCAB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    word: { type: 'string', description: '표제어 (소문자 원형)' },
    pos: { type: 'string', description: "품사 축약 표기: 'v.' | 'n.' | 'adj.' | 'adv.' 등" },
    ipa: { type: 'string', description: 'IPA 발음기호, 슬래시 포함 (예: /prəˈkjʊərmənt/)' },
    meaning_ko: { type: 'string', description: '한국어 뜻 (쉼표로 구분된 1-3개)' },
    examples: {
      type: 'array', minItems: 2, maxItems: 2,
      items: { type: 'string', description: 'TOEIC/비즈니스 맥락의 영어 예문' },
    },
    difficulty: { type: 'integer', minimum: 1, maximum: 5, description: 'TOEIC 기준 난도' },
  },
  required: ['word', 'pos', 'ipa', 'meaning_ko', 'examples', 'difficulty'],
};

export const TASK_SCHEMAS = { tutor: TUTOR_SCHEMA, vocab_entry: VOCAB_SCHEMA };

// 스키마 검증 (외부 의존성 없이 필요한 만큼만)
export function validateAgainst(schema, value) {
  const errors = [];
  const walk = (sch, val, path) => {
    const types = Array.isArray(sch.type) ? sch.type : [sch.type];
    const jsType = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;
    const typeOk = types.some((t) =>
      t === 'integer' ? (jsType === 'number' && Number.isInteger(val)) : t === jsType);
    if (!typeOk) { errors.push(`${path || '$'}: ${types.join('|')} 이어야 함 (실제 ${jsType})`); return; }
    if (val === null) return;
    if (sch.enum && !sch.enum.includes(val)) errors.push(`${path}: ${sch.enum.join('|')} 중 하나여야 함`);
    if (types.includes('object') && sch.properties) {
      for (const key of sch.required || []) {
        if (!(key in val)) errors.push(`${path || '$'}.${key}: 누락`);
      }
      for (const [key, sub] of Object.entries(sch.properties)) {
        if (key in val) walk(sub, val[key], `${path || '$'}.${key}`);
      }
    }
    if (types.includes('array')) {
      if (sch.minItems !== undefined && val.length < sch.minItems) errors.push(`${path}: 최소 ${sch.minItems}개`);
      if (sch.maxItems !== undefined && val.length > sch.maxItems) errors.push(`${path}: 최대 ${sch.maxItems}개`);
      if (sch.items) val.forEach((item, i) => walk(sch.items, item, `${path}[${i}]`));
    }
    if (types.includes('integer') || types.includes('number')) {
      if (sch.minimum !== undefined && val < sch.minimum) errors.push(`${path}: ${sch.minimum} 이상`);
      if (sch.maximum !== undefined && val > sch.maximum) errors.push(`${path}: ${sch.maximum} 이하`);
    }
  };
  walk(schema, value, '');
  return errors;
}

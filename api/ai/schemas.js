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

// '오늘의 단어' 퀴즈 — 주제에 맞는 10단어 + 4지선다용 오답 보기 3개 (docs/plan/06-vocab-daily-quiz.md)
export const VOCAB_QUIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic_title: { type: 'string', description: '퀴즈 주제 제목 (한국어, 20자 이내)' },
    topic_ko: { type: 'string', description: '주제 한 줄 설명 (한국어)' },
    words: {
      type: 'array', minItems: 10, maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          word: { type: 'string', description: '표제어 (소문자 원형)' },
          pos: { type: 'string', description: "품사 축약: 'n.' | 'v.' | 'adj.' | 'adv.' 등" },
          ipa: { type: 'string', description: 'IPA 발음기호, 슬래시 포함' },
          meaning_ko: { type: 'string', description: '정답 한국어 뜻 (1-3개, 쉼표 구분)' },
          example_en: { type: 'string', description: '주제 맥락의 영어 예문 1개' },
          example_ko: { type: 'string', description: '예문의 한국어 번역' },
          distractors_ko: {
            type: 'array', minItems: 3, maxItems: 3,
            items: { type: 'string', description: '오답 보기 — 같은 품사의 그럴듯하지만 명확히 다른 한국어 뜻' },
          },
          difficulty: { type: 'integer', minimum: 1, maximum: 5, description: 'TOEIC 기준 난도' },
          etymology: { type: 'string', description: '어원·유래 이야기 1-2문장 (한국어) — 어근 분해(라틴/그리스 등)나 단어가 생긴 역사. 확실하지 않으면 빈 문자열' },
          synonyms: {
            type: 'array', minItems: 0, maxItems: 2,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                word: { type: 'string', description: '유의어 (영어 소문자 원형)' },
                ipa: { type: 'string', description: 'IPA 발음기호, 슬래시 포함' },
                meaning_ko: { type: 'string', description: '간단한 한국어 뜻' },
              },
              required: ['word', 'ipa', 'meaning_ko'],
            },
            description: '유의어 0~2개 — 각각 뜻·발음기호 포함, 없으면 빈 배열',
          },
          antonyms: {
            type: 'array', minItems: 0, maxItems: 2,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                word: { type: 'string', description: '반의어 (영어 소문자 원형)' },
                ipa: { type: 'string', description: 'IPA 발음기호, 슬래시 포함' },
                meaning_ko: { type: 'string', description: '간단한 한국어 뜻' },
              },
              required: ['word', 'ipa', 'meaning_ko'],
            },
            description: '반의어 0~2개 — 각각 뜻·발음기호 포함, 없으면 빈 배열',
          },
        },
        required: ['word', 'pos', 'ipa', 'meaning_ko', 'example_en', 'example_ko', 'distractors_ko', 'difficulty', 'etymology', 'synonyms', 'antonyms'],
      },
    },
  },
  required: ['topic_title', 'topic_ko', 'words'],
};

// 레슨 Jina Q&A — 서버가 조립한 학습 자료(지문 / 제출 후엔 문항+학습자 답)에 근거한 한국어 설명 + 지문 원문 인용.
// 정답·해설은 자료에 없으므로 스키마에도 없다 (docs/plan/07-topic-sections-ai-generation-toeic.md Phase 1)
export const LESSON_QA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string', description: '학습 자료에 근거한 한국어 설명' },
    citations: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          quote: { type: 'string', description: '지문 원문을 글자 그대로 인용한 근거 문장/구' },
        },
        required: ['quote'],
      },
    },
  },
  required: ['answer', 'citations'],
};

// TOEIC Part 5 생성 — count의 정확한 일치는 작업 저장 직전 서비스 검증에서 확인한다.
// JSON Schema는 provider 네이티브 제약으로 구조와 상한을 먼저 보장한다.
export const LESSON_GEN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    // LC(part='lc') 전용 — 화자 라벨이 붙은 대화/설명문 4~8줄. Part 5 응답에는 없다(선택 필드).
    script: { type: 'array', minItems: 4, maxItems: 8, items: { type: 'string' } },
    items: {
      type: 'array', minItems: 3, maxItems: 10,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          stem: { type: 'string' },
          options: {
            type: 'array', minItems: 4, maxItems: 4,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                id: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                text: { type: 'string' },
              },
              required: ['id', 'text'],
            },
          },
          answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          explanation: { type: 'string' },
          skill_code: { type: 'string', enum: ['grammar', 'vocab', 'detail', 'inference', 'main_idea'] },
        },
        required: ['stem', 'options', 'answer', 'explanation', 'skill_code'],
      },
    },
  },
  required: ['title', 'subtitle', 'items'],
};

// LC 변형 — 같은 모양이지만 script 가 필수다. 선택 필드로 두면 모델이 통째로 빠뜨린다(실측).
// 프롬프트 계약(schemaContract)과 응답 검증이 같은 객체를 봐야 하므로 여기서 파생한다.
export const LESSON_GEN_LC_SCHEMA = {
  ...LESSON_GEN_SCHEMA,
  required: ['title', 'subtitle', 'script', 'items'],
};

export const SCENARIO_GEN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    tag: { type: 'string' },
    description: { type: 'string' },
    system_prompt: { type: 'string' },
    opening_message: { type: 'string' },
    objectives: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string' } },
  },
  required: ['title', 'tag', 'description', 'system_prompt', 'opening_message', 'objectives'],
};

// Phase 3 토픽 임계치가 단어 20개이므로 생성 세트도 정확히 20개를 계약한다.
export const VOCAB_SET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    words: {
      type: 'array', minItems: 20, maxItems: 20,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          word: { type: 'string' },
          pos: { type: 'string' },
          ipa: { type: 'string' },
          meaning_ko: { type: 'string' },
          example_en: { type: 'string' },
          example_ko: { type: 'string' },
          difficulty: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['word', 'pos', 'ipa', 'meaning_ko', 'example_en', 'example_ko', 'difficulty'],
      },
    },
  },
  required: ['title', 'description', 'words'],
};

export const TASK_SCHEMAS = {
  tutor: TUTOR_SCHEMA,
  vocab_entry: VOCAB_SCHEMA,
  vocab_quiz: VOCAB_QUIZ_SCHEMA,
  lesson_qa: LESSON_QA_SCHEMA,
  lesson_gen: LESSON_GEN_SCHEMA,
  scenario_gen: SCENARIO_GEN_SCHEMA,
  vocab_set: VOCAB_SET_SCHEMA,
};

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

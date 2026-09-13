// TOEIC Part 7 독해 20섹션 시드 생성 — db/content/*.json 덮어쓰기(토픽) · RC 콘텐츠 병합.
// 실행: node scripts/generate-toeic-rc-seed.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'content');
const read = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
const write = (f, data) => writeFileSync(join(DIR, f), `${JSON.stringify(data, null, 2)}\n`, 'utf8');

/** @type {Array<{slug:string,label_ko:string,description:string,passageType:string,subject:string,legacyLesson?:string,words:string[]}>} */
const SECTIONS = [
  {
    slug: 'toeic-rc-business-email',
    label_ko: '비즈니스 이메일',
    description: '업무 이메일의 목적·요청·일정을 읽고 핵심을 파악합니다.',
    passageType: 'EMAIL',
    subject: 'Business Email',
    legacyLesson: 'toeic-part7-set23',
    words: ['accommodate', 'finalize', 'anticipate', 'blocker', 'deadline', 'coordinate', 'brief', 'launch', 'priority', 'flexibility', 'regarding', 'attached', 'follow-up', 'confirm', 'schedule', 'recipient', 'cc', 'action item', 'reminder', 'accordingly'],
  },
  {
    slug: 'toeic-rc-office-notice',
    label_ko: '사내 공지·안내문',
    description: '시설·운영·안전 공지를 읽고 직원이 취해야 할 조치를 찾습니다.',
    passageType: 'NOTICE',
    subject: 'Office Notice',
    legacyLesson: 'toeic-part7-set24',
    words: ['operational', 'maintenance', 'mobility', 'inconvenience', 'cooperation', 'facility', 'scheduled', 'temporary', 'unavailable', 'advise', 'accordingly', 'assistance', 'timeline', 'hydraulic', 'stairwell', 'personnel', 'comply', 'restriction', 'notify', 'apologize'],
  },
  {
    slug: 'toeic-rc-meeting-schedule',
    label_ko: '회의 초대·일정 조율',
    description: '회의 초대·변경 메일에서 시간·장소·아젠다를 확인합니다.',
    passageType: 'EMAIL',
    subject: 'Meeting Invitation',
    words: ['agenda', 'reschedule', 'availability', 'conference room', 'attendee', 'postpone', 'tentative', 'calendar', 'overlap', 'facilitate', 'minutes', 'quarterly', 'stand-up', 'virtual', 'in-person', 'RSVP', 'time zone', 'recurring', 'slot', 'confirm'],
  },
  {
    slug: 'toeic-rc-memo-minutes',
    label_ko: '회의록·업무 메모',
    description: '메모·회의록에서 결정 사항과 담당자를 찾습니다.',
    passageType: 'MEMO',
    subject: 'Internal Memo',
    words: ['memo', 'minutes', 'action item', 'follow-up', 'assigned', 'consensus', 'deliberate', 'circulate', 'distribution', 'reference', 'summary', 'deadline', 'stakeholder', 'resolution', 'pending', 'approved', 'revised', 'draft', 'circulation', 'record'],
  },
  {
    slug: 'toeic-rc-job-posting',
    label_ko: '채용 공고',
    description: '채용 광고에서 자격·책임·지원 방법을 읽습니다.',
    passageType: 'ADVERTISEMENT',
    subject: 'Job Opening',
    words: ['qualification', 'requirement', 'responsibility', 'benefit', 'compensation', 'applicant', 'resume', 'shortlist', 'interview', 'probation', 'full-time', 'part-time', 'remote', 'on-site', 'deadline', 'submit', 'eligible', 'experience', 'proficiency', 'referral'],
  },
  {
    slug: 'toeic-rc-hr-policy',
    label_ko: 'HR·복리후생 안내',
    description: '인사·복지 안내에서 자격과 절차를 파악합니다.',
    passageType: 'NOTICE',
    subject: 'HR Announcement',
    words: ['benefit', 'leave', 'entitlement', 'enrollment', 'eligible', 'policy', 'procedure', 'reimbursement', 'wellness', 'pension', 'holiday', 'sick leave', 'parental', 'training', 'orientation', 'handbook', 'compliance', 'mandatory', 'opt-in', 'deadline'],
  },
  {
    slug: 'toeic-rc-product-ad',
    label_ko: '제품·서비스 광고',
    description: '광고문에서 혜택·가격·기한을 읽습니다.',
    passageType: 'ADVERTISEMENT',
    subject: 'Product Promotion',
    words: ['promotion', 'discount', 'limited', 'offer', 'subscription', 'trial', 'feature', 'upgrade', 'bundle', 'warranty', 'refund', 'guarantee', 'exclusive', 'launch', 'premium', 'affordable', 'redeem', 'coupon', 'valid', 'expire'],
  },
  {
    slug: 'toeic-rc-news-article',
    label_ko: '뉴스·기사',
    description: '비즈니스 기사에서 사실·원인·영향을 파악합니다.',
    passageType: 'ARTICLE',
    subject: 'Business News',
    words: ['acquisition', 'merger', 'revenue', 'forecast', 'expansion', 'regulation', 'investor', 'quarterly', 'market share', 'competitor', 'announce', 'executive', 'strategy', 'growth', 'decline', 'surge', 'report', 'analyst', 'sector', 'outlook'],
  },
  {
    slug: 'toeic-rc-event-invitation',
    label_ko: '행사·세미나 안내',
    description: '행사 안내에서 등록·일정·비용을 확인합니다.',
    passageType: 'NOTICE',
    subject: 'Event Invitation',
    words: ['registration', 'venue', 'keynote', 'workshop', 'networking', 'attendee', 'badge', 'catering', 'seating', 'capacity', 'waitlist', 'early bird', 'sponsor', 'exhibit', 'session', 'certificate', 'check-in', 'agenda', 'host', 'RSVP'],
  },
  {
    slug: 'toeic-rc-customer-review',
    label_ko: '고객 리뷰·평가',
    description: '리뷰에서 만족·불만 포인트와 추천 의도를 읽습니다.',
    passageType: 'REVIEW',
    subject: 'Customer Review',
    words: ['satisfactory', 'disappointing', 'recommend', 'responsive', 'courteous', 'overpriced', 'convenient', 'reliable', 'defective', 'refund', 'rating', 'feedback', 'complaint', 'praise', 'amenity', 'checkout', 'hospitality', 'value', 'expectation', 'overall'],
  },
  {
    slug: 'toeic-rc-order-shipping',
    label_ko: '주문·배송 확인',
    description: '주문·배송 메일에서 번호·상태·조치를 찾습니다.',
    passageType: 'EMAIL',
    subject: 'Order Confirmation',
    words: ['order', 'shipment', 'tracking', 'delivery', 'dispatch', 'warehouse', 'backorder', 'invoice', 'quantity', 'carrier', 'estimated', 'delay', 'replacement', 'return', 'confirmation', 'purchase', 'receipt', 'status', 'fulfill', 'notify'],
  },
  {
    slug: 'toeic-rc-invoice-billing',
    label_ko: '견적·청구·결제',
    description: '청구서·견적에서 금액·기한·조건을 읽습니다.',
    passageType: 'LETTER',
    subject: 'Invoice Notice',
    words: ['invoice', 'payment', 'due date', 'outstanding', 'balance', 'remittance', 'overdue', 'installment', 'tax', 'subtotal', 'discount', 'penalty', 'billing', 'account', 'settle', 'receipt', 'transaction', 'currency', 'quote', 'terms'],
  },
  {
    slug: 'toeic-rc-travel-itinerary',
    label_ko: '출장·여행 일정',
    description: '출장 일정표에서 이동·미팅·체크인을 확인합니다.',
    passageType: 'SCHEDULE',
    subject: 'Travel Itinerary',
    words: ['itinerary', 'departure', 'arrival', 'layover', 'terminal', 'boarding', 'customs', 'expense', 'per diem', 'accommodation', 'confirmation', 'gate', 'shuttle', 'conference', 'visa', 'baggage', 'connection', 'rebook', 'check-in', 'destination'],
  },
  {
    slug: 'toeic-rc-reservation',
    label_ko: '예약 확인·변경',
    description: '예약 메일에서 날짜·인원·변경 규정을 읽습니다.',
    passageType: 'EMAIL',
    subject: 'Reservation Details',
    words: ['reservation', 'booking', 'cancellation', 'modify', 'non-refundable', 'deposit', 'availability', 'suite', 'confirmation number', 'guest', 'check-out', 'amenity', 'upgrade', 'hold', 'no-show', 'policy', 'rate', 'voucher', 'extend', 'confirm'],
  },
  {
    slug: 'toeic-rc-instructions',
    label_ko: '사용 설명·조작 안내',
    description: '설명문에서 순서·주의·조건을 파악합니다.',
    passageType: 'INSTRUCTION',
    subject: 'User Guide',
    words: ['instruction', 'manual', 'step', 'caution', 'assemble', 'configure', 'troubleshoot', 'indicator', 'power on', 'disconnect', 'compatible', 'warranty void', 'diagram', 'sequence', 'malfunction', 'reset', 'install', 'maintain', 'properly', 'otherwise'],
  },
  {
    slug: 'toeic-rc-web-announcement',
    label_ko: '웹·온라인 공지',
    description: '웹 공지에서 점검·약관·기능 변경을 읽습니다.',
    passageType: 'WEB POST',
    subject: 'Website Notice',
    words: ['maintenance', 'downtime', 'login', 'password', 'update', 'browser', 'compatible', 'privacy', 'cookie', 'terms', 'feature', 'rollout', 'beta', 'patch', 'outage', 'restore', 'backup', 'security', 'notification', 'subscribe'],
  },
  {
    slug: 'toeic-rc-survey-results',
    label_ko: '설문·조사 결과',
    description: '조사 결과에서 수치·경향·제안을 읽습니다.',
    passageType: 'REPORT',
    subject: 'Survey Summary',
    words: ['survey', 'respondent', 'percentage', 'satisfaction', 'trend', 'feedback', 'participation', 'margin', 'highlight', 'concern', 'recommendation', 'benchmark', 'decline', 'improvement', 'majority', 'minority', 'conduct', 'aggregate', 'finding', 'response rate'],
  },
  {
    slug: 'toeic-rc-press-release',
    label_ko: '보도자료',
    description: '보도자료에서 발표 내용·일정·인용을 파악합니다.',
    passageType: 'PRESS RELEASE',
    subject: 'Press Release',
    words: ['announce', 'CEO', 'partnership', 'milestone', 'expansion', 'headquarters', 'spokesperson', 'quote', 'media', 'investor', 'launch', 'initiative', 'commitment', 'sustainable', 'innovation', 'revenue', 'appoint', 'effective', 'contact', 'embargo'],
  },
  {
    slug: 'toeic-rc-company-policy',
    label_ko: '규정·정책 안내',
    description: '사내 규정에서 의무·예외·시행일을 확인합니다.',
    passageType: 'POLICY',
    subject: 'Company Policy',
    words: ['policy', 'compliance', 'mandatory', 'violation', 'exception', 'effective', 'revise', 'acknowledge', 'confidential', 'expense', 'reimbursement', 'approval', 'prohibit', 'permit', 'disciplinary', 'guideline', 'enforce', 'amendment', 'scope', 'violate'],
  },
  {
    slug: 'toeic-rc-faq-support',
    label_ko: 'FAQ·고객 문의',
    description: 'FAQ에서 질문 유형과 해결 절차를 읽습니다.',
    passageType: 'FAQ',
    subject: 'Customer Support FAQ',
    words: ['FAQ', 'troubleshoot', 'refund', 'warranty', 'contact support', 'troubleshooting', 'account', 'reset password', 'shipping', 'return policy', 'eligible', 'processing time', 'escalate', 'ticket', 'live chat', 'knowledge base', 'workaround', 'resolve', 'inquiry', 'assist'],
  },
];

function lessonSlug(section, n) {
  if (n === 1 && section.legacyLesson) return section.legacyLesson;
  return `${section.slug}-${n}`;
}

function posFor(word) {
  if (word.includes(' ')) return 'phr.';
  if (/^(re|un|dis)/.test(word) || word.endsWith('ly')) return 'adv.';
  if (word.endsWith('tion') || word.endsWith('ment') || word.endsWith('ness')) return 'n.';
  if (word.endsWith('ive') || word.endsWith('able') || word.endsWith('ful')) return 'adj.';
  if (word.endsWith('ate') || word.endsWith('ify') || word.endsWith('ize')) return 'v.';
  return 'n.';
}

function makeLesson(section, n) {
  const slug = lessonSlug(section, n);
  const diff = n === 1 ? 2 : n === 2 ? 3 : 4;
  const topicLine = `${section.label_ko} · Set ${n}`;
  const bodyLead = section.passageType === 'EMAIL'
    ? ['Dear colleague,', `This message relates to ${section.subject.toLowerCase()} for our team.`]
    : [`Please review the following ${section.subject.toLowerCase()}.`];
  return {
    slug,
    kind: 'toeic_part7',
    title: 'TOEIC Part 7 — 단일 지문',
    subtitle: topicLine,
    difficulty: diff,
    est_minutes: 5 + n,
    passage: {
      type: section.passageType,
      subject: `${section.subject} — ${topicLine}`,
      from: section.passageType === 'EMAIL' ? 'Team Lead <lead@company.com>' : 'Administration',
      to: section.passageType === 'EMAIL' ? 'All Staff' : '',
      cc: section.passageType === 'EMAIL' ? '' : undefined,
      date: 'Monday, June 1 · 10:00',
      body: [
        ...bodyLead,
        `We need to **confirm the plan by Friday, June 5** so vendors can prepare accordingly.`,
        `If you have questions about ${section.words[0]} or ${section.words[1]}, contact the office before noon.`,
        `Thank you for your cooperation.`,
      ].filter(Boolean),
    },
    vocab: section.words.slice(0, 3).map((word) => ({
      word,
      pos: posFor(word),
      ipa: '',
      meaning: `${word} (독해 핵심 어휘)`,
      ex: `use ${word} in context`,
    })),
    faq: [
      '이 지문의 목적을 한국어로 요약해 주세요',
      'Friday, June 5 와 관련된 내용은 무엇인가요?',
    ],
    position: 100 + SECTIONS.indexOf(section) * 3 + n,
    source: 'seed',
    visibility: 'public',
    items: [
      {
        position: 1,
        stem: 'What is the main purpose of this passage?',
        options: [
          { id: 'A', text: 'To announce a company merger' },
          { id: 'B', text: `To provide information about ${section.subject.toLowerCase()}` },
          { id: 'C', text: 'To request employee resignations' },
          { id: 'D', text: 'To advertise a new product line' },
        ],
        answer: 'B',
        explanation: `(B) 지문은 ${section.label_ko} 맥락의 ${section.passageType} 형식 안내입니다.`,
        skill_code: 'main_idea',
      },
      {
        position: 2,
        stem: 'According to the passage, by when should staff confirm the plan?',
        options: [
          { id: 'A', text: 'Monday, June 1' },
          { id: 'B', text: 'Friday, June 5' },
          { id: 'C', text: 'Before noon only' },
          { id: 'D', text: 'Next month' },
        ],
        answer: 'B',
        explanation: '(B) "confirm the plan by Friday, June 5"가 정답 근거입니다.',
        skill_code: 'detail',
      },
      {
        position: 3,
        stem: 'The word "accordingly" in the passage is closest in meaning to —',
        options: [
          { id: 'A', text: 'randomly' },
          { id: 'B', text: 'in a suitable way' },
          { id: 'C', text: 'reluctantly' },
          { id: 'D', text: 'temporarily' },
        ],
        answer: 'B',
        explanation: '(B) accordingly는 상황에 맞게, 그에 따라라는 뜻입니다.',
        skill_code: 'vocab',
      },
    ],
  };
}

function makeScenario(section) {
  return {
    slug: `${section.slug}-scenario`,
    title: `${section.label_ko} — 회화 연습`,
    tag: 'TOEIC RC',
    level: 3,
    description: `${section.label_ko} 상황에서 영어로 요청·확인하는 연습입니다.`,
    system_prompt: `You are a supportive English coach. Help the learner discuss ${section.subject.toLowerCase()} in clear business English.`,
    opening_message: `Let's practice a short conversation about ${section.label_ko.toLowerCase()}. What would you like to clarify first?`,
    objectives: [
      `${section.label_ko} 핵심 표현 사용하기`,
      '정중하게 요청·확인하기',
      '후속 질문에 답하기',
    ],
    source: 'seed',
    visibility: 'public',
  };
}

function makeVocabSet(section) {
  const words = section.words.slice(0, 20);
  while (words.length < 20) words.push(`${section.slug.split('-').pop()}-${words.length + 1}`);
  return {
    slug: `${section.slug}-words`,
    title: `${section.label_ko} 핵심 20단어`,
    description: `${section.label_ko} 지문에서 자주 나오는 표현입니다.`,
    words: words.map((word) => ({
      word,
      pos: posFor(word),
      meaning_ko: `${word} (독해)` ,
    })),
    source: 'seed',
    visibility: 'public',
  };
}

function makeTopics() {
  return SECTIONS.map((section) => ({
    slug: section.slug,
    label_ko: section.label_ko,
    description: section.description,
    visibility: 'public',
    contents: [
      { position: 1, content_slug: lessonSlug(section, 1) },
      { position: 2, content_slug: lessonSlug(section, 2) },
      { position: 3, content_slug: lessonSlug(section, 3) },
      { position: 10, content_slug: `${section.slug}-scenario` },
      { position: 20, content_slug: `${section.slug}-words` },
    ],
  }));
}

// ── 병합: 기존 비-RC 시드(면접 Part5·LC·레거시 시나리오/단어) 유지 ──
const legacyLessons = read('lessons.json').filter((l) => !l.slug.startsWith('toeic-rc-'));

const legacyScenarios = read('scenarios.json').filter((s) => !s.slug.startsWith('toeic-rc-'));
const legacyVocab = read('vocab-sets.json').filter((v) => !v.slug.startsWith('toeic-rc-'));

const rcLessons = SECTIONS.flatMap((s) => [1, 2, 3].map((n) => makeLesson(s, n)));
const rcScenarios = SECTIONS.map(makeScenario);
const rcVocab = SECTIONS.map(makeVocabSet);

// legacyLesson 은 legacyLessons 에 이미 있으므로 rcLessons 에서 중복 slug 제거
const legacySlugs = new Set(legacyLessons.map((l) => l.slug));
const newRcLessons = rcLessons.filter((l) => !legacySlugs.has(l.slug));

write('topics.json', makeTopics());
write('lessons.json', [...legacyLessons, ...newRcLessons]);
write('scenarios.json', [...legacyScenarios, ...rcScenarios]);
write('vocab-sets.json', [...legacyVocab, ...rcVocab]);

console.log(`topics: ${SECTIONS.length}`);
console.log(`lessons: ${legacyLessons.length} legacy + ${newRcLessons.length} new RC (${legacyLessons.length + newRcLessons.length + SECTIONS.filter((s) => s.legacyLesson).length} total with reused)`);
console.log(`scenarios: ${legacyScenarios.length + rcScenarios.length}`);
console.log(`vocab-sets: ${legacyVocab.length + rcVocab.length}`);

// provider 레지스트리 + 헬스/모델 캐시.
// 채팅 경로에서는 auth 프로브를 절대 호출하지 않는다 — 헬스는 TTL 캐시만 읽는다.
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { agy } from './providers/agy.js';
import { claude } from './providers/claude.js';
import { codex } from './providers/codex.js';
import { cursor } from './providers/cursor.js';
import { ollama } from './providers/ollama.js';

export const PROVIDERS = new Map([
  ['claude', claude], ['agy', agy], ['codex', codex], ['cursor', cursor], ['ollama', ollama],
]);

export function getProvider(id) {
  const provider = PROVIDERS.get(id);
  if (!provider) throw new HttpError(400, 'UNKNOWN_PROVIDER', `알 수 없는 provider: ${id}`);
  return provider;
}

const HEALTH_TTL_MS = 60_000;
let healthCache = { at: 0, providers: null, inflight: null };

export async function providerHealth({ force = false, ollamaUrl } = {}) {
  const now = Date.now();
  if (!force && healthCache.providers && now - healthCache.at < HEALTH_TTL_MS) {
    return { cached: true, checkedAt: healthCache.at, providers: healthCache.providers };
  }
  if (healthCache.inflight) return healthCache.inflight; // 프로브 폭주 방지
  healthCache.inflight = (async () => {
    const entries = await Promise.allSettled(
      [...PROVIDERS.values()].map(async (p) => {
        const probe = await p.probe({ baseUrl: p.id === 'ollama' ? ollamaUrl : undefined });
        return [p.id, { ok: probe.ok, detail: probe.detail, label: p.label }];
      }),
    );
    const providers = Object.fromEntries(entries.map((e, i) =>
      e.status === 'fulfilled' ? e.value : [[...PROVIDERS.keys()][i], { ok: false, detail: String(e.reason) }]));
    healthCache = { at: Date.now(), providers, inflight: null };
    return { cached: false, checkedAt: healthCache.at, providers };
  })();
  try {
    return await healthCache.inflight;
  } finally {
    healthCache.inflight = null;
  }
}

export function warmProviderHealth() {
  providerHealth({ force: true }).catch(() => {});
}

const MODELS_TTL_MS = 10 * 60_000;
let modelsCache = { at: 0, data: null };

export async function providerMeta() {
  const now = Date.now();
  if (modelsCache.data && now - modelsCache.at < MODELS_TTL_MS) return modelsCache.data;
  const data = await Promise.all([...PROVIDERS.values()].map(async (p) => ({
    id: p.id,
    label: p.label,
    kind: p.kind,
    supportsJsonSchema: p.supportsJsonSchema,
    defaultModel: p.defaultModel,
    models: await Promise.resolve(p.models()).catch(() => []),
  })));
  modelsCache = { at: now, data };
  return data;
}

export const defaultProviderId = () =>
  PROVIDERS.has(config.ai.defaultProvider) ? config.ai.defaultProvider : 'claude';

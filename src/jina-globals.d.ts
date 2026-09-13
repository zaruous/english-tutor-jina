/**
 * Jina 프론트 IDE 타입 — F12·자동완성용. 런타임 연결은 HTML script 순서가 담당한다.
 *
 * - src/*.jsx 의 전역 함수(JinaDropdown, AdminShell …)는 jsconfig include 로 정의로 이동한다.
 *   이 파일에 다시 declare 하지 않는다(중복·F12 충돌).
 * - CDN React · window.JINA_* 만 여기 선언한다.
 *
 * Vite 전환 후: `import React from 'react'`, `import { JinaDropdown } from '@/components/JinaDropdown'`
 * 로 옮기면서 이 파일은 window 전역만 남기거나 삭제한다.
 */

import type * as ReactTypes from 'react';
import type * as ReactDomTypes from 'react-dom';
import type * as ReactDomClientTypes from 'react-dom/client';

declare global {
  const React: typeof ReactTypes;
  const ReactDOM: typeof ReactDomTypes & typeof ReactDomClientTypes;

  interface JinaApiClient {
    base: string;
    fetch(path: string, opts?: Record<string, unknown>): Promise<Record<string, unknown>>;
    get(path: string, opts?: Record<string, unknown>): Promise<Record<string, unknown>>;
    post(path: string, body?: unknown, opts?: Record<string, unknown>): Promise<Record<string, unknown>>;
    patch(path: string, body?: unknown, opts?: Record<string, unknown>): Promise<Record<string, unknown>>;
    del(path: string, opts?: Record<string, unknown>): Promise<Record<string, unknown>>;
  }

  interface JinaTheme {
    bg: string;
    bgSoft: string;
    text: string;
    textMuted: string;
    textDim: string;
    accent: string;
    accentGrad: string;
    accent2?: string;
    accent3?: string;
    border: string;
    borderStrong: string;
    surface: string;
    surfaceElev: string;
    card: string;
    cardHover?: string;
    chipBg: string;
    error: string;
    success: string;
    warning: string;
    shadow: string;
    glassBg?: string;
    isDark?: boolean;
    [key: string]: string | boolean | undefined;
  }

  interface Window {
    JINA_API: JinaApiClient;
    JINA_CONFIG?: {
      apiBase?: string;
      provider?: string;
      ollamaUrl?: string;
      [key: string]: unknown;
    };
    JINA_AI?: {
      PROVIDER_META?: Record<string, { label?: string; [key: string]: unknown }>;
      modelLabel?: (cfg: unknown) => { label?: string; [key: string]: unknown };
      [key: string]: unknown;
    };
    JINA_READONLY?: boolean;
    jinaSpeak?: (text: string, opts?: Record<string, unknown>) => boolean | void;
    jinaHHMM?: () => string;
  }

  const JINA_THEMES: Record<string, JinaTheme>;
  const Icons: Record<string, ReactTypes.ComponentType<{ size?: number; style?: ReactTypes.CSSProperties }>>;
}

export {};

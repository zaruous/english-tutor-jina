#!/usr/bin/env bash
# OpenPronounce 발음 평가 사이드카 — 네이티브(venv) 설치, Linux/macOS 판 (플랜 10).
# Windows 는 install-python.ps1. 두 스크립트는 같은 순서를 밟는다:
#   venv → torch(CPU 휠, 실패하면 PyPI 기본 휠) → requirements.txt
# 설정 화면의 [설치] 버튼(POST /api/speaking/sidecar/install)이 이 스크립트를 실행한다 —
# 한 줄씩 진행 로그를 stdout 으로 내보내 화면이 꼬리를 보여줄 수 있게 한다.
#
#   bash lib/pronounce/install-python.sh          # 설치만
#   bash lib/pronounce/install-python.sh --run    # 설치 후 기동 (포트 8000)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$DIR/.venv"
PY="$VENV/bin/python"
PORT="${PORT:-8000}"
RUN=0
for a in "$@"; do [ "$a" = "--run" ] && RUN=1; done

say() { echo "  $*"; }
echo; echo "=== OpenPronounce 사이드카 · 네이티브(venv) 설치 ==="; echo

# 1) Python 3.10+
PYEXE=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then
    v=$("$c" -c 'import sys;print("%d.%d"%sys.version_info[:2])' 2>/dev/null || true)
    if [ -n "$v" ] && [ "$(printf '%s\n' "3.10" "$v" | sort -V | head -1)" = "3.10" ]; then PYEXE="$c"; say "Python $v ($c)"; break; fi
  fi
done
[ -n "$PYEXE" ] || { say "Python 3.10 이상을 찾을 수 없습니다."; exit 1; }

# 2) ffmpeg · espeak-ng — 시스템 패키지. 없으면 안내만 하고 계속한다(설치는 되지만 첫 평가가 실패한다).
command -v ffmpeg >/dev/null 2>&1 && say "ffmpeg OK" || say "⚠ ffmpeg 가 PATH 에 없습니다 — 브라우저 webm 을 디코딩할 수 없습니다. (apt install ffmpeg / brew install ffmpeg)"
if command -v espeak-ng >/dev/null 2>&1; then say "espeak-ng OK"; else say "⚠ espeak-ng 가 없습니다 — phonemizer 가 동작하지 않습니다. (apt install espeak-ng / brew install espeak-ng)"; fi

# 3) venv + 설치
if [ ! -x "$PY" ]; then say ".venv 생성 중…"; "$PYEXE" -m venv "$VENV"; fi
say "pip 업그레이드"; "$PY" -m pip install --upgrade pip --quiet
say "torch (CPU 휠) 설치 중… 수백 MB 라 몇 분 걸립니다"
if ! "$PY" -m pip install torch --index-url https://download.pytorch.org/whl/cpu; then
  say "CPU 인덱스에 접근할 수 없어 PyPI 기본 휠로 설치합니다 (CUDA 의존성 포함, 용량이 크지만 CPU 에서 동작합니다)"
  "$PY" -m pip install torch
fi
say "openpronounce + FastAPI 설치 중…"
"$PY" -m pip install -r "$DIR/requirements.txt"
say "설치 완료"
echo "INSTALL_DONE"

# 4) 기동 (선택)
if [ "$RUN" = "1" ]; then
  export OPENPRONOUNCE_TTS="${OPENPRONOUNCE_TTS:-piper}" OPENPRONOUNCE_DEVICE="${OPENPRONOUNCE_DEVICE:-cpu}"
  say "서버 기동: http://localhost:$PORT  (Ctrl+C 로 종료)"
  say "첫 평가 요청은 Wav2Vec2 체크포인트 2개(~1.2GB 씩)를 내려받아 수 분 걸립니다."
  exec "$PY" -m uvicorn server:app --host 127.0.0.1 --port "$PORT" --app-dir "$DIR"
else
  echo; say "기동:  bash lib/pronounce/install-python.sh --run   (또는 설정 화면의 [시작])"
fi

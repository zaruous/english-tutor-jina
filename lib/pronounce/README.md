# lib/pronounce — 발음 평가 사이드카 (OpenPronounce)

앱 밖에서 도는 로컬 서비스다. **Ollama 와 같은 취급**: 따로 띄워 두고, Node API(3004)가 HTTP 로 부르고,
안 떠 있으면 앱은 v1 받아쓰기 모드로 폴백한다. 설계 배경은 [`docs/plan/10-pronunciation-assessment.md`](../../docs/plan/10-pronunciation-assessment.md).

```
브라우저 (MediaRecorder)
  └─ POST /api/speaking/assess           → Node API (3004)
       └─ POST localhost:8000/pronunciation  → 이 사이드카 (FastAPI)
            └─ 점수 · 음소 IPA → Node 가 정규화 → 화면
```

## 왜 자체 래퍼(server.py)인가

[OpenPronounce](https://github.com/Halleck45/OpenPronounce)(MIT, Wav2Vec2 + DTW)의 PyPI 휠에는
**라이브러리와 CLI 만** 들어 있다 — 저장소의 웹앱(`server.py`)은 패키지에 포함되지 않아
`uvicorn server:app` 이 동작하지 않는다. 남의 저장소를 트리에 끌고 오는 대신 필요한 두 엔드포인트만
얇게 감쌌다. 그러면 응답을 처음부터 우리 계약 모양으로 정규화할 수 있어 Node 어댑터가 얇아진다.

CLI 를 `child_process` 로 부르지 않는 이유는 모델 로딩이다 — Wav2Vec2 체크포인트 2개(~1.2GB 씩)를
매 호출 다시 올리면 문장 하나에 수십 초가 걸린다. 상주 서버여야 메모리에 올려둔 모델을 재사용한다.

## 설치 — 두 가지 중 하나

| | Docker | 네이티브(venv) |
|---|---|---|
| 명령 | `pwsh lib/pronounce/install-docker.ps1` | `pwsh lib/pronounce/install-python.ps1 -Run` |
| 시스템 의존성 | 이미지에 포함(espeak-ng·ffmpeg) | 직접 설치 — 스크립트가 winget 으로 시도 |
| 사전 조건 | **Docker Desktop 실행 중**이어야 함 | Python 3.10+ |
| 모델 캐시(~2.5GB) | named volume `jina-pronounce-cache` | `~/.cache` (자동 유지) |
| 성능 | WSL2 경유 오버헤드 약간 | 직접 CPU |

이 PC(2026-09-01 확인)에는 Python 3.11·ffmpeg 가 이미 있고 espeak-ng 만 없다. Docker 는 설치돼 있으나
데몬이 꺼져 있다 — **네이티브 쪽이 손이 덜 간다.**

설치가 끝나면 `.env` 에 한 줄 추가하고 API 를 재기동한다:

```
PRONUNCIATION_URL=http://localhost:8000
```

연결 확인은 `node scripts/verify-pronunciation.mjs` — `GET /api/speaking/assess/status` 가 `available:true` 를 주고,
픽스처 wav 2개(잘 읽은 것·틀리게 읽은 것)로 실호출해 틀린 쪽 점수가 실제로 낮은지까지 단정한다.

## HTTP 계약

| | |
|---|---|
| `GET /health` | `{ok, backend, version, tts, device}` — 모델을 로딩하지 않고 즉시 답한다(기동 확인용) |
| `POST /pronunciation` | form: `file`(오디오), `expected_text`, `lang`(기본 `en`), `prosody`(기본 false) |

응답:

```json
{
  "ok": true, "backend": "openpronounce", "score": 59.0,
  "transcript": "HELL NO WHO ARE YOU",
  "feedback": "...", "phoneme_error_rate": 0.31, "word_error_rate": 0.4,
  "expected_phones": "...", "heard_phones": "...",
  "errors": [{ "word": "hello", "expected": "həloʊ", "actual": "hɛlnoʊ", "confidence": 0.89 }],
  "words_with_errors": [ ... ]
}
```

`file` 은 ffmpeg 가 읽는 포맷이면 무엇이든 된다 — 브라우저의 `audio/webm;codecs=opus` 도 그대로 보내면
`load_audio` 가 16kHz mono 로 디코딩한다. **오디오는 평가 후 즉시 삭제한다**(플랜 10 §3.4).

`prosody=true` 면 f0·energy 곡선이 붙는데 프레임 단위 배열이라 응답이 커진다 — 화면이 쓸 때만 켠다.

## 알아둘 것

- **첫 평가 요청이 느리다.** Wav2Vec2 체크포인트 2개를 그때 내려받는다(수 분). 이후는 캐시에서 뜬다.
  `/health` 는 모델을 건드리지 않으므로 이걸로 "준비됨"을 판단하면 안 된다.
- **TTS 기본값이 gTTS 라 인터넷을 쓴다.** OpenPronounce 는 목표 문장을 TTS 로 합성해 DTW 로 비교하는데,
  기본 백엔드 gTTS 는 그 **문장 텍스트**를 Google 로 보낸다. 그래서 설치 스크립트와 Dockerfile 은
  `OPENPRONOUNCE_TTS=piper`(완전 오프라인, 음성 ~60MB)를 기본으로 둔다. 어느 쪽이든 **학습자의 음성은
  이 PC 를 떠나지 않는다.**
- **Windows 의 phonemizer 는 DLL 경로를 환경변수로 받는다.** `PHONEMIZER_ESPEAK_LIBRARY` 가 없으면
  espeak 를 설치해도 못 찾는다. `install-python.ps1` 이 경로를 찾아 설정하고 기동 명령에도 찍어준다.
- **사이드카가 꺼져 있는 것은 버그가 아니다.** Node 어댑터는 v1 폴백으로 내려가야 한다.
  (Ollama 미기동으로 E2E 가 대량 503 실패한 전례가 있다 — 같은 실수를 반복하지 말 것.)

## 재기동 · 정리

```powershell
# 네이티브
pwsh lib/pronounce/install-python.ps1 -SkipInstall -Run

# Docker
docker start jina-pronounce
docker stop  jina-pronounce
docker logs  jina-pronounce
```

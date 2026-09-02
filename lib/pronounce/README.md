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

## 설치 — 세 가지 중 하나

가장 쉬운 길은 **앱 설정 → 음성 인식(STT) → OpenPronounce 선택 → [서버에 설치] → [시작]** 이다.
버튼은 Node API 가 아래 네이티브 스크립트를 실행하고(`POST /api/speaking/sidecar/install`), 진행 로그 꼬리를 화면에 보여준다.
`NODE_ENV=production` 에서는 버튼이 비활성(403)이다 — 서버에서 패키지를 까는 버튼은 개발 편의이지 운영 기능이 아니다.

| | Docker | 네이티브(venv) |
|---|---|---|
| 명령 | `pwsh lib/pronounce/install-docker.ps1` | Windows `pwsh lib/pronounce/install-python.ps1 -Run` · Linux/mac `bash lib/pronounce/install-python.sh --run` |
| 시스템 의존성 | 이미지에 포함(espeak-ng·ffmpeg) | 직접 설치 — 스크립트가 winget 으로 시도 |
| 사전 조건 | **Docker Desktop 실행 중**이어야 함 | Python 3.10+ |
| 모델 캐시(~2.5GB) | named volume `jina-pronounce-cache` | `~/.cache` (자동 유지) |
| 성능 | WSL2 경유 오버헤드 약간 | 직접 CPU |

사내 프록시(SSL 검사) 망의 개발 PC 에서는 **Docker 방식으로 설치·기동을 확인했다**(2026-09-02) — `jina-pronounce`
컨테이너가 `--restart unless-stopped` 로 상주한다. 그런 망에서는 아래 두 가지가 선행 조건이다(재설치 시에도 필요):

1. **Docker Desktop 의 컨테이너용 프록시** — 설정에 프록시가 있어도 `ContainersProxyHTTPMode` 가
   `disabled` 면 pull·빌드가 직결을 시도하다 타임아웃 난다. Settings → Resources → Proxies 에서
   컨테이너 프록시를 켜야 한다(호스트용 `ProxyHTTPMode` 와 별개 항목이다).
2. **사내 CA(`corp-ca.crt`)** — 프록시가 pypi 등 HTTPS 를 SSL 검사(MITM)하므로, 이 디렉터리에
   `corp-ca.crt` 를 두면 Dockerfile 이 이미지 신뢰 저장소에 넣는다(없으면 무동작 · git 미추적).
   재생성(Windows): `Get-ChildItem Cert:\LocalMachine\Root | ? Subject -match <사내 CA 이름>` 의 RawData 를 PEM 으로 저장.

BuildKit 의 `FROM` 메타데이터 조회는 프록시를 안 타는 경우가 있다 — 빌드 전에
`docker pull python:3.11-slim` 으로 베이스를 미리 받아두면 우회된다.

기본 주소(`http://localhost:8000`)로 띄웠다면 `.env` 를 건드릴 필요가 없다. 다른 포트·호스트면 한 줄 추가하고 API 를 재기동한다:

```
PRONUNCIATION_URL=http://localhost:8000
```

화면의 [시작]은 `.venv` 의 uvicorn 을 detached 로 띄우고 `lib/pronounce/.sidecar.pid` 에 pid 를 남긴다(로그는 `sidecar.log`).
Node 를 재시작해도 사이드카는 살아 있고, [중지]가 그 pid 로 끝낸다. Windows 는 espeak DLL 경로를 Node 가 찾아 환경변수로 넘긴다.

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

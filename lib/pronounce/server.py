"""OpenPronounce 사이드카 — 발음 평가 HTTP 서버 (플랜 10 §2.3 · §4 Phase 1).

Node API(3004)의 `/api/speaking/assess` 가 이 서버를 프록시한다. Ollama 와 같은 취급이다:
따로 떠 있는 로컬 프로세스이고, 안 떠 있으면 앱은 v1 받아쓰기 모드로 폴백한다.

왜 우리가 직접 쓰는가 — PyPI 휠(`openpronounce` 0.3.0)에는 라이브러리와 CLI 만 들어 있고
웹앱(`server.py`)은 저장소에만 있다. 남의 저장소를 트리에 끌고 오는 대신 필요한 두 엔드포인트만
얇게 감싼다. 그러면 응답을 처음부터 우리 계약 모양으로 정규화할 수 있어 Node 어댑터가 얇아진다.

CLI 로 호출하지 않는 이유: Wav2Vec2 체크포인트 2개(~1.2GB 씩)를 매 호출 다시 로딩하면
문장 하나에 수십 초가 걸린다. 모델을 메모리에 올려둔 채 재사용하려면 상주 서버여야 한다.
"""
import logging
import os
import tempfile

import openpronounce
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from openpronounce import compare_audio_with_text, load_audio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jina-pronounce")

# 브라우저 MediaRecorder 한 문장은 수백 KB 다. 그보다 크면 잘못된 업로드로 본다.
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

app = FastAPI(title="Jina pronunciation sidecar", version=openpronounce.__version__)


@app.get("/health")
def health():
    """Node 어댑터가 기동 여부를 확인하는 자리. 모델 로딩은 하지 않는다(즉시 응답)."""
    return {
        "ok": True,
        "backend": "openpronounce",
        "version": openpronounce.__version__,
        # gtts 는 목표 문장을 Google 로 보낸다 — 설치 스크립트는 piper(오프라인)를 기본으로 둔다.
        "tts": os.environ.get("OPENPRONOUNCE_TTS", "gtts"),
        "device": os.environ.get("OPENPRONOUNCE_DEVICE", "cpu"),
    }


@app.post("/pronunciation")
async def pronunciation(
    file: UploadFile = File(...),
    expected_text: str = Form(...),
    lang: str = Form("en"),
    prosody: bool = Form(False),
):
    """오디오 + 목표 문장 → 발음 점수.

    `file` 은 ffmpeg 가 읽는 아무 포맷이나 된다 — 브라우저의 `audio/webm;codecs=opus` 도
    openpronounce 의 `load_audio` 가 ffmpeg 로 디코딩해 16kHz mono 로 리샘플한다.
    """
    text = (expected_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="expected_text 가 비어 있습니다")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="오디오가 비어 있습니다")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"오디오가 너무 큽니다 ({len(payload)} bytes)")

    # load_audio 는 경로를 받는다 — 업로드를 임시 파일로 떨어뜨린 뒤 반드시 지운다.
    # 오디오는 평가 후 보관하지 않는다(플랜 10 §3.4).
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(payload)
            tmp_path = tmp.name
        sound = load_audio(tmp_path)
        raw = compare_audio_with_text(sound, text, lang=lang)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - 어떤 실패든 Node 가 폴백할 수 있게 502 로 알린다
        logger.exception("평가 실패")
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                logger.warning("임시 파일 삭제 실패: %s", tmp_path)

    diff = raw.get("differences") or {}
    out = {
        "ok": True,
        "backend": "openpronounce",
        "score": raw.get("score"),
        "transcript": raw.get("transcribe"),
        "feedback": raw.get("feedback"),
        "language": raw.get("language"),
        "phoneme_error_rate": diff.get("phoneme_error_rate"),
        "word_error_rate": diff.get("word_error_rate"),
        "expected_phones": diff.get("expected_phones"),
        "heard_phones": diff.get("heard_phones"),
        "heard_phones_confidence": diff.get("heard_phones_confidence"),
        # 단어별 오류: {word, expected, actual, confidence} — 화면의 음소 상세가 이걸 쓴다.
        "errors": diff.get("errors") or [],
        "words_with_errors": diff.get("words_with_errors") or [],
    }
    # f0·energy 는 프레임 단위 배열이라 응답을 크게 만든다 — 요청할 때만 싣는다.
    if prosody:
        out["prosody"] = raw.get("prosody")
    return out

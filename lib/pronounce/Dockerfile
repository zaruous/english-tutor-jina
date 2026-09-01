# OpenPronounce 발음 평가 사이드카 (플랜 10)
# 빌드·기동은 install-docker.ps1 이 한다. 직접 하려면:
#   docker build -t jina-pronounce lib/pronounce
#   docker run -d --name jina-pronounce -p 8000:8000 -v jina-pronounce-cache:/cache jina-pronounce
FROM python:3.11-slim

# espeak-ng = phonemizer 가 목표 문장을 IPA 로 바꿀 때 쓰는 시스템 라이브러리(런타임 필수).
# ffmpeg    = 브라우저 MediaRecorder 의 webm/opus 를 디코딩한다.
# 이 두 줄이 Docker 방식의 존재 이유다 — 네이티브 설치에서는 espeak-ng 를 손으로 깔아야 한다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg espeak-ng \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch 를 CPU 휠로 먼저 — requirements.txt 에 두면 CUDA 휠(2GB+)을 받는다.
COPY requirements.txt ./
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY server.py ./

# piper = 완전 오프라인 TTS. 기본값 gtts 는 목표 문장을 Google 로 보내고 인터넷을 요구한다.
# 캐시는 전부 /cache 아래로 모아 named volume 하나만 붙이면 되게 한다 —
# Wav2Vec2 2개(~1.2GB 씩) + piper 음성(~60MB) + 합성 wav 캐시. 볼륨이 없으면 컨테이너를
# 다시 만들 때마다 2.5GB 를 다시 받는다.
ENV OPENPRONOUNCE_TTS=piper \
    OPENPRONOUNCE_DEVICE=cpu \
    HF_HOME=/cache/huggingface \
    OPENPRONOUNCE_CACHE_DIR=/cache/openpronounce

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]

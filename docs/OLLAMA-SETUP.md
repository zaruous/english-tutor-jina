# Ollama 빠른 설정 가이드

## 한 줄 요약

```bash
# 1. 설치  (macOS)
brew install ollama
# 또는: https://ollama.com/download

# 2. 모델 다운로드
ollama pull llama3.2

# 3. CORS 허용 모드로 실행 ← 브라우저에서 호출하려면 필수!
OLLAMA_ORIGINS="*" ollama serve
```

`http://localhost:11434` 에서 동작합니다.

---

## 운영체제별

### macOS

```bash
brew install ollama
ollama pull llama3.2
OLLAMA_ORIGINS="*" ollama serve
```

영구 설정 (재부팅 후에도 CORS 유지):
```bash
launchctl setenv OLLAMA_ORIGINS "*"
# Ollama 앱 재시작
```

### Linux (systemd)

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl edit ollama.service
```

에디터에 다음 추가:
```ini
[Service]
Environment="OLLAMA_ORIGINS=*"
```

저장 후:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
ollama pull llama3.2
```

### Windows (PowerShell)

```powershell
# https://ollama.com/download/windows 에서 설치 후

# 환경 변수 영구 설정
[System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', '*', 'User')

# Ollama 트레이 아이콘에서 종료 후 재시작
# 또는 새 PowerShell에서:
$env:OLLAMA_ORIGINS = "*"
ollama serve
```

---

## 모델 추천

| 명령어 | 크기 | 한국어 | 영어 첨삭 | RAM 권장 |
|--------|------|--------|---------|---------|
| `ollama pull qwen2.5:3b` | 2GB | ◯ | △ | 8GB |
| `ollama pull llama3.2` | 4GB | ◎ | ◯ | 8GB |
| `ollama pull llama3.1:8b` | 8GB | ◎ | ◎ | 16GB |
| `ollama pull qwen2.5:14b` | 9GB | ◎ | ◎◎ | 16GB |
| `ollama pull mistral:7b` | 4GB | △ | ◎ | 8GB |

**처음이라면 `llama3.2`로 시작하세요.**

---

## 연결 확인

```bash
# 모델 목록
curl http://localhost:11434/api/tags

# 간단한 채팅 테스트
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [{ "role": "user", "content": "Hello in Korean please" }],
  "stream": false
}'
```

JSON 응답이 오면 정상 동작입니다.

---

## 트러블슈팅

### "CORS error" — 브라우저 콘솔에 빨간 메시지

→ `OLLAMA_ORIGINS="*" ollama serve`로 다시 시작했는지 확인.
→ 위 환경 변수 영구 설정 사용을 권장.

### "connection refused" / "Failed to fetch"

→ Ollama 데몬이 안 떠 있음. 터미널에서 `ollama serve` 실행 중인지 확인.
→ 포트 11434가 다른 프로세스에 의해 점유되지 않았는지: `lsof -i :11434`

### 응답이 너무 느림

→ 모델이 너무 큼. `qwen2.5:3b`로 다운그레이드.
→ GPU 가속이 안 되고 있을 수 있음. `ollama ps`로 확인.

### 한국어 응답이 이상함

→ 3B 이하 모델은 한국어가 약함.
→ `llama3.1:8b` 또는 `qwen2.5:7b` 이상 추천.

### JSON 파싱 실패 — Jina가 가끔 이상한 형식으로 답함

→ `ai-provider.jsx`의 시스템 프롬프트를 더 엄격하게 보강하거나, `extractJson()` 휴리스틱이 자동으로 복구합니다.
→ Claude로 전환하면 안정성이 훨씬 높습니다 (Tweaks에서 변경).

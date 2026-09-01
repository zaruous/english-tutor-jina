#Requires -Version 7
<#
.SYNOPSIS
  OpenPronounce 발음 평가 사이드카를 Docker 로 세운다 (플랜 10).

.DESCRIPTION
  이미지를 빌드하고 컨테이너를 띄운 뒤 /health 가 응답할 때까지 기다린다.
  모델 캐시(~2.5GB)는 named volume 에 두므로 컨테이너를 지우고 다시 만들어도 다시 받지 않는다.

  네이티브 설치(install-python.ps1)와의 차이는 espeak-ng·ffmpeg 뿐이다 — 이미지 안에 들어 있어
  손으로 깔 것이 없다. 대신 Docker Desktop 이 떠 있어야 하고 WSL2 를 경유하는 오버헤드가 약간 있다.

.EXAMPLE
  pwsh lib/pronounce/install-docker.ps1
  pwsh lib/pronounce/install-docker.ps1 -Port 8001 -Rebuild
#>
param(
  [int]$Port = 8000,
  [switch]$Rebuild,      # 이미지가 이미 있어도 다시 빌드한다
  [switch]$SkipRun       # 빌드만 하고 컨테이너는 띄우지 않는다
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Image     = 'jina-pronounce:latest'
$Container = 'jina-pronounce'
$Volume    = 'jina-pronounce-cache'
$ScriptDir = $PSScriptRoot

function Say([string]$msg, [string]$color = 'Cyan') { Write-Host "  $msg" -ForegroundColor $color }

Write-Host "`n=== OpenPronounce 사이드카 · Docker 설치 ===`n" -ForegroundColor White

# 1) docker 존재와 데몬 기동 확인 -------------------------------------------------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Say 'docker 명령을 찾을 수 없습니다. Docker Desktop 을 설치하거나 install-python.ps1 을 쓰세요.' 'Red'
  exit 1
}
docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Say 'Docker 데몬이 응답하지 않습니다 — Docker Desktop 을 먼저 실행해 주세요.' 'Red'
  Say '(작업 표시줄에서 Docker Desktop 을 띄우고 고래 아이콘이 안정되면 다시 실행)' 'DarkGray'
  exit 1
}
Say "docker OK ($(docker info --format '{{.ServerVersion}}' 2>$null))" 'Green'

# 2) 이미지 빌드 ------------------------------------------------------------------
$exists = (docker images -q $Image 2>$null)
if ($exists -and -not $Rebuild) {
  Say "이미지 $Image 가 이미 있습니다 (다시 빌드하려면 -Rebuild)" 'Yellow'
} else {
  Say "이미지 빌드 중… 처음이면 torch·transformers 내려받기에 몇 분 걸립니다"
  docker build -t $Image $ScriptDir
  if ($LASTEXITCODE -ne 0) { Say '빌드 실패' 'Red'; exit 1 }
  Say "빌드 완료: $Image" 'Green'
}

if ($SkipRun) { Say '-SkipRun 이므로 여기서 멈춥니다' 'Yellow'; exit 0 }

# 3) 캐시 볼륨 --------------------------------------------------------------------
if (-not (docker volume ls -q --filter "name=^$Volume$")) {
  docker volume create $Volume | Out-Null
  Say "캐시 볼륨 생성: $Volume" 'Green'
}

# 4) 기존 컨테이너 정리 후 기동 ----------------------------------------------------
if (docker ps -aq --filter "name=^$Container$") {
  Say "기존 컨테이너 제거: $Container" 'Yellow'
  docker rm -f $Container | Out-Null
}
docker run -d --name $Container --restart unless-stopped `
  -p "${Port}:8000" -v "${Volume}:/cache" $Image | Out-Null
if ($LASTEXITCODE -ne 0) { Say '컨테이너 기동 실패' 'Red'; exit 1 }
Say "컨테이너 기동: $Container (포트 $Port)" 'Green'

# 5) /health 대기 ----------------------------------------------------------------
Say '/health 응답 대기 중…'
$ok = $false
foreach ($i in 1..60) {
  try {
    $r = Invoke-RestMethod "http://localhost:$Port/health" -TimeoutSec 3
    if ($r.ok) { $ok = $true; Say "health OK — openpronounce $($r.version), tts=$($r.tts), device=$($r.device)" 'Green'; break }
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $ok) {
  Say '기동을 확인하지 못했습니다. 로그를 보세요:' 'Red'
  Say "  docker logs $Container" 'DarkGray'
  exit 1
}

Write-Host ''
Say '--- 다음 할 일 ---' 'White'
Say ".env 에 추가:  PRONUNCIATION_URL=http://localhost:$Port"
Say '첫 평가 요청은 Wav2Vec2 체크포인트 2개(~1.2GB 씩)를 내려받아 수 분 걸립니다 — 볼륨에 남아 다음부터는 빠릅니다.' 'DarkGray'
Say '중지/재개:  docker stop jina-pronounce  /  docker start jina-pronounce' 'DarkGray'
Write-Host ''

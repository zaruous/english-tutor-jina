#Requires -Version 7
<#
.SYNOPSIS
  OpenPronounce 발음 평가 사이드카를 네이티브(venv)로 세운다 (플랜 10).

.DESCRIPTION
  lib/pronounce/.venv 를 만들고 torch(CPU 휠) → requirements.txt 순서로 설치한다.
  Docker 방식과 달리 시스템에 espeak-ng 가 있어야 하며(없으면 winget 으로 설치를 시도한다),
  Windows 의 phonemizer 는 libespeak-ng.dll 경로를 환경변수로 받아야 동작한다 — 이 스크립트가
  경로를 찾아 설정하고 마지막에 기동 명령으로도 알려준다.

.EXAMPLE
  pwsh lib/pronounce/install-python.ps1              # 설치만
  pwsh lib/pronounce/install-python.ps1 -Run         # 설치 후 기동
  pwsh lib/pronounce/install-python.ps1 -SkipInstall -Run   # 기동만 (재기동용)
#>
param(
  [int]$Port = 8000,
  [switch]$Run,          # 설치 후 서버를 띄운다
  [switch]$SkipInstall,  # 설치를 건너뛴다 (재기동용)
  [switch]$Recreate      # .venv 를 지우고 다시 만든다
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$ScriptDir = $PSScriptRoot
$VenvDir   = Join-Path $ScriptDir '.venv'
$VenvPy    = Join-Path $VenvDir 'Scripts\python.exe'

function Say([string]$msg, [string]$color = 'Cyan') { Write-Host "  $msg" -ForegroundColor $color }

Write-Host "`n=== OpenPronounce 사이드카 · 네이티브(venv) 설치 ===`n" -ForegroundColor White

# 1) Python 3.10+ ---------------------------------------------------------------
# 후보는 해시테이블로 둔다 — 배열 리터럴 안의 1요소 배열은 스칼라로 언랩돼 인덱싱이 깨진다.
function Test-PythonVersion([string]$exe, [string[]]$extra) {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { return $null }
  try { $v = & $exe @extra -c 'import sys;print("%d.%d"%sys.version_info[:2])' 2>$null } catch { return $null }
  if ($v -and [version]$v -ge [version]'3.10') { return $v }
  return $null
}

$PyExe = $null
$PyArgs = @()
foreach ($cand in @(@{ e = 'py'; a = @('-3') }, @{ e = 'python'; a = @() }, @{ e = 'python3'; a = @() })) {
  $ver = Test-PythonVersion $cand.e $cand.a
  if ($ver) {
    $PyExe = $cand.e; $PyArgs = $cand.a
    Say "Python $ver ($($cand.e) $($cand.a -join ' '))".TrimEnd() 'Green'
    break
  }
}
if (-not $PyExe) { Say 'Python 3.10 이상을 찾을 수 없습니다.' 'Red'; exit 1 }

# 2) ffmpeg — 브라우저 webm/opus 디코딩에 필요 -----------------------------------
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
  Say 'ffmpeg OK' 'Green'
} else {
  Say 'ffmpeg 가 PATH 에 없습니다 — 브라우저 webm 녹음을 디코딩할 수 없습니다.' 'Yellow'
  Say '설치:  winget install Gyan.FFmpeg' 'DarkGray'
}

# 3) espeak-ng — phonemizer 가 목표 문장을 IPA 로 바꿀 때 쓰는 시스템 라이브러리 ----
function Find-EspeakDll {
  $paths = @(
    (Join-Path $env:ProgramFiles 'eSpeak NG\libespeak-ng.dll'),
    (Join-Path ${env:ProgramFiles(x86)} 'eSpeak NG\libespeak-ng.dll')
  )
  foreach ($p in $paths) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}
$dll = Find-EspeakDll
if (-not $dll) {
  Say 'espeak-ng 가 없습니다 — winget 으로 설치를 시도합니다…' 'Yellow'
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id eSpeak-NG.eSpeak-NG --accept-package-agreements --accept-source-agreements
    $dll = Find-EspeakDll
  }
}
if ($dll) {
  Say "espeak-ng OK ($dll)" 'Green'
} else {
  Say 'espeak-ng 설치를 확인하지 못했습니다. 수동 설치 후 다시 실행하세요:' 'Red'
  Say '  winget install eSpeak-NG.eSpeak-NG' 'DarkGray'
  Say '(또는 Docker 방식을 쓰면 이 의존성이 이미지 안에 들어 있습니다: install-docker.ps1)' 'DarkGray'
  if (-not $SkipInstall) { exit 1 }
}

# 4) venv + 설치 ----------------------------------------------------------------
if (-not $SkipInstall) {
  if ($Recreate -and (Test-Path $VenvDir)) { Say '.venv 제거' 'Yellow'; Remove-Item -Recurse -Force $VenvDir }
  if (-not (Test-Path $VenvPy)) {
    Say '.venv 생성 중…'
    & $PyExe @PyArgs -m venv $VenvDir
    if (-not (Test-Path $VenvPy)) { Say 'venv 생성 실패' 'Red'; exit 1 }
  }
  Say 'pip 업그레이드'
  & $VenvPy -m pip install --upgrade pip --quiet

  # torch 를 CPU 휠로 먼저 — 이 순서를 건너뛰면 CUDA 휠(2GB+)을 받는다.
  Say 'torch (CPU 휠) 설치 중… 수백 MB 라 몇 분 걸립니다'
  & $VenvPy -m pip install torch --index-url https://download.pytorch.org/whl/cpu
  if ($LASTEXITCODE -ne 0) { Say 'torch 설치 실패' 'Red'; exit 1 }

  Say 'openpronounce + FastAPI 설치 중…'
  & $VenvPy -m pip install -r (Join-Path $ScriptDir 'requirements.txt')
  if ($LASTEXITCODE -ne 0) { Say '의존성 설치 실패' 'Red'; exit 1 }
  Say '설치 완료' 'Green'
}

if (-not (Test-Path $VenvPy)) { Say '.venv 가 없습니다 — -SkipInstall 없이 다시 실행하세요.' 'Red'; exit 1 }

# 5) 실행 환경 -------------------------------------------------------------------
# piper = 완전 오프라인 TTS. 기본값 gtts 는 목표 문장을 Google 로 보내고 인터넷을 요구한다.
$env:OPENPRONOUNCE_TTS = 'piper'
$env:OPENPRONOUNCE_DEVICE = 'cpu'
if ($dll) { $env:PHONEMIZER_ESPEAK_LIBRARY = $dll }

if ($Run) {
  Write-Host ''
  Say "서버 기동: http://localhost:$Port  (Ctrl+C 로 종료)" 'Green'
  Say '첫 평가 요청은 Wav2Vec2 체크포인트 2개(~1.2GB 씩)를 내려받아 수 분 걸립니다.' 'DarkGray'
  & $VenvPy -m uvicorn server:app --host 127.0.0.1 --port $Port --app-dir $ScriptDir
} else {
  Write-Host ''
  Say '--- 기동 명령 ---' 'White'
  Say "pwsh lib/pronounce/install-python.ps1 -SkipInstall -Run -Port $Port"
  Say '(직접 띄우려면 아래 환경변수를 반드시 설정할 것 — 없으면 phonemizer 가 espeak 를 못 찾는다)' 'DarkGray'
  if ($dll) { Say "`$env:PHONEMIZER_ESPEAK_LIBRARY = '$dll'" 'DarkGray' }
  Say "`$env:OPENPRONOUNCE_TTS = 'piper'" 'DarkGray'
  Say ".env 에 추가:  PRONUNCIATION_URL=http://localhost:$Port"
  Write-Host ''
}

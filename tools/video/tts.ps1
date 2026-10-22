# Synthesize each narration segment to a WAV file with the offline Windows voice (no network).
param([string]$Dir = $PSScriptRoot, [string]$Voice = "Microsoft Zira Desktop", [int]$Rate = 1)
Add-Type -AssemblyName System.Speech
$items = Get-Content -Raw -Encoding UTF8 (Join-Path $Dir "narration.json") | ConvertFrom-Json
$outDir = Join-Path $Dir "audio"
New-Item -ItemType Directory -Force $outDir | Out-Null
foreach ($it in $items) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice($Voice)
  $s.Rate = $Rate
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $s.SetOutputToWaveFile((Join-Path $outDir ($it.id + ".wav")), $fmt)
  $s.Speak($it.text)
  $s.Dispose()
}
"done"

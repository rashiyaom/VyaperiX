$UpscaylBin = "tools\upscayl-repo\resources\win\bin\upscayl-bin.exe"
$ModelsDir = "tools\upscayl-repo\resources\models"
$RawDir = "C:\Users\Administrator\.gemini\antigravity-ide\brain\554d3925-147b-499f-87a6-fe00934c0815\scratch\raw_4k"
$OutTest = "tools\model_tests"
if (-not (Test-Path $OutTest)) { New-Item -ItemType Directory -Path $OutTest -Force | Out-Null }

$models = @("ultrasharp-4x", "digital-art-4x", "ultramix-balanced-4x")

foreach ($m in $models) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $targetDir = Join-Path $OutTest $m
    if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
    & $UpscaylBin -i (Join-Path $RawDir "light_frame_0080.png") -o (Join-Path $targetDir "out.png") -m $ModelsDir -n $m -w 2560 -t 128
    $sw.Stop()
    Write-Host ("Model: {0} completed in {1:N1} seconds" -f $m, $sw.Elapsed.TotalSeconds)
}

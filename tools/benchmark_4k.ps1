$Ffmpeg = "C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe"
$ArtifactsDir = "C:\Users\Administrator\.gemini\antigravity-ide\brain\554d3925-147b-499f-87a6-fe00934c0815"
$SrcLight = Join-Path $ArtifactsDir "frame_0080_light_4k.png"
$SrcDark = Join-Path $ArtifactsDir "frame_0080_dark_4k.png"

# True 4K (3840x2160) Lanczos
& $Ffmpeg -y -i $SrcLight -vf "scale=3840:2160:flags=lanczos" -c:v libwebp -quality 95 (Join-Path $ArtifactsDir "true_4k_light_q95.webp")
& $Ffmpeg -y -i $SrcLight -vf "scale=3840:2160:flags=lanczos" -c:v libwebp -quality 90 (Join-Path $ArtifactsDir "true_4k_light_q90.webp")
& $Ffmpeg -y -i $SrcLight -vf "scale=3840:2160:flags=lanczos" -c:v libwebp -quality 85 (Join-Path $ArtifactsDir "true_4k_light_q85.webp")
& $Ffmpeg -y -i $SrcDark -vf "scale=3840:2160:flags=lanczos" -c:v libwebp -quality 95 (Join-Path $ArtifactsDir "true_4k_dark_q95.webp")
& $Ffmpeg -y -i $SrcDark -vf "scale=3840:2160:flags=lanczos" -c:v libwebp -quality 90 (Join-Path $ArtifactsDir "true_4k_dark_q90.webp")
& $Ffmpeg -y -i $SrcDark -vf "scale=3840:2160:flags=lanczos" -c:v libwebp -quality 85 (Join-Path $ArtifactsDir "true_4k_dark_q85.webp")

Write-Host "--- Benchmark Sizes ---"
Get-ChildItem $ArtifactsDir\true_4k_*.webp | Select-Object Name, Length

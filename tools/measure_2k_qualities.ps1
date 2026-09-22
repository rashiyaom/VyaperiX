$Ffmpeg = "C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe"
$ArtifactsDir = "C:\Users\Administrator\.gemini\antigravity-ide\brain\554d3925-147b-499f-87a6-fe00934c0815"
$SrcLight = Join-Path $ArtifactsDir "frame_0080_light_4k.png"
$SrcDark = Join-Path $ArtifactsDir "frame_0080_dark_4k.png"

# Benchmark 2K UltraSharp at various WebP qualities
& $Ffmpeg -y -i $SrcLight -vf "scale=2560:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" -c:v libwebp -quality 95 "tools\light_2k_q95.webp"
& $Ffmpeg -y -i $SrcLight -vf "scale=2560:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" -c:v libwebp -quality 90 "tools\light_2k_q90.webp"
& $Ffmpeg -y -i $SrcLight -vf "scale=2560:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" -c:v libwebp -quality 85 "tools\light_2k_q85.webp"
& $Ffmpeg -y -i $SrcLight -vf "scale=2560:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" -c:v libwebp -quality 80 "tools\light_2k_q80.webp"

& $Ffmpeg -y -i $SrcDark -vf "scale=2560:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" -c:v libwebp -quality 95 "tools\dark_2k_q95.webp"
& $Ffmpeg -y -i $SrcDark -vf "scale=2560:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" -c:v libwebp -quality 90 "tools\dark_2k_q90.webp"
& $Ffmpeg -y -i $SrcDark -vf "scale=2560:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" -c:v libwebp -quality 85 "tools\dark_2k_q85.webp"
& $Ffmpeg -y -i $SrcDark -vf "scale=2560:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" -c:v libwebp -quality 80 "tools\dark_2k_q80.webp"

Get-ChildItem tools\*_2k_q*.webp | Select-Object Name, Length

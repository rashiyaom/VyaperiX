$Ffmpeg = "C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe"
$UpscaylBin = "tools\upscayl-repo\resources\win\bin\upscayl-bin.exe"
$ModelsDir = "tools\upscayl-repo\resources\models"
$ArtifactsDir = "C:\Users\Administrator\.gemini\antigravity-ide\brain\554d3925-147b-499f-87a6-fe00934c0815"
$Scratch = Join-Path $ArtifactsDir "scratch"

if (-not (Test-Path $Scratch)) {
    New-Item -ItemType Directory -Path $Scratch -Force | Out-Null
}

$RawDir = Join-Path $Scratch "raw_4k"
$UpDir = Join-Path $Scratch "up_4k"
@($RawDir, $UpDir) | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

Write-Host "Extracting frame 80 from light and dark mode..." -ForegroundColor Cyan
& $Ffmpeg -y -ss 00:00:03.333 -i "drive-download-20260920T090751Z-1-001\Create_a_premium_cinematic_D.mp4" -vframes 1 (Join-Path $RawDir "light_frame_0080.png")
& $Ffmpeg -y -ss 00:00:03.333 -i "drive-download-20260920T090751Z-1-001\take_this_video_dont_change_a.mp4" -vframes 1 (Join-Path $RawDir "dark_frame_0080.png")

Write-Host "Upscaling with Upscayl ultrasharp-4x to 4K (3840x2160)..." -ForegroundColor Cyan
& $UpscaylBin -i $RawDir -o $UpDir -m $ModelsDir -n "ultrasharp-4x" -w 3840 -s 4 -f png -t 128

# Convert to 4K WebP and copy PNGs to Artifacts and public folder
$Public4K = "frontend\public\sample_4k"
if (-not (Test-Path $Public4K)) { New-Item -ItemType Directory -Path $Public4K -Force | Out-Null }

$LightUp = Join-Path $UpDir "light_frame_0080.png"
$DarkUp = Join-Path $UpDir "dark_frame_0080.png"

# Save light mode 4K PNG and WebP
Copy-Item $LightUp (Join-Path $ArtifactsDir "frame_0080_light_4k.png") -Force
Copy-Item $LightUp (Join-Path $Public4K "frame_0080_light_4k.png") -Force
& $Ffmpeg -y -i $LightUp -c:v libwebp -quality 95 (Join-Path $ArtifactsDir "frame_0080_light_4k.webp")
& $Ffmpeg -y -i $LightUp -c:v libwebp -quality 95 (Join-Path $Public4K "frame_0080_light_4k.webp")

# Save dark mode 4K PNG and WebP
Copy-Item $DarkUp (Join-Path $ArtifactsDir "frame_0080_dark_4k.png") -Force
Copy-Item $DarkUp (Join-Path $Public4K "frame_0080_dark_4k.png") -Force
& $Ffmpeg -y -i $DarkUp -c:v libwebp -quality 95 (Join-Path $ArtifactsDir "frame_0080_dark_4k.webp")
& $Ffmpeg -y -i $DarkUp -c:v libwebp -quality 95 (Join-Path $Public4K "frame_0080_dark_4k.webp")

Write-Host "Done! 4K frames saved to artifacts and public/sample_4k" -ForegroundColor Green
Get-ChildItem (Join-Path $ArtifactsDir "frame_0080_*") | Select-Object Name, Length

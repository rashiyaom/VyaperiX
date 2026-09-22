$Ffmpeg = "C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe"
$SrcLight = "drive-download-20260920T090751Z-1-001\Create_a_premium_cinematic_D.mp4"
$SrcDark = "drive-download-20260920T090751Z-1-001\take_this_video_dont_change_a.mp4"

$OutDir = "frontend\public\videos"
if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$LightOut = Join-Path $OutDir "hero_light_2k.mp4"
$DarkOut = Join-Path $OutDir "hero_dark_2k.mp4"

Write-Host "Encoding Light Mode 2K Video (Lanczos + CAS + Unsharp, CRF 18)..." -ForegroundColor Cyan
& $Ffmpeg -y -i $SrcLight -vf "scale=2560:1440:flags=lanczos,cas=0.75,unsharp=5:5:0.6:5:5:0.0" -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -movflags +faststart -an $LightOut

Write-Host "Encoding Dark Mode 2K Video (Lanczos + CAS + Unsharp, CRF 18)..." -ForegroundColor Cyan
& $Ffmpeg -y -i $SrcDark -vf "scale=2560:1440:flags=lanczos,cas=0.75,unsharp=5:5:0.6:5:5:0.0" -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -movflags +faststart -an $DarkOut

Write-Host "--- Encoded Video Sizes ---" -ForegroundColor Green
Get-ChildItem $OutDir\hero_*_2k.mp4 | Select-Object Name, Length, @{Name="MB"; Expression={"{0:N2} MB" -f ($_.Length / 1MB)}}

$total = (Get-ChildItem $OutDir\hero_*_2k.mp4 | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("Total combined size: {0:N2} MB" -f $total) -ForegroundColor Green

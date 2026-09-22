param(
    [string]$LightVideo = "drive-download-20260920T090751Z-1-001\Create_a_premium_cinematic_D.mp4",
    [string]$DarkVideo = "drive-download-20260920T090751Z-1-001\take_this_video_dont_change_a.mp4",
    [string]$OutputBase = "exported_frames",
    [string]$FrontendBase = "frontend\public\frames",
    [int]$TargetWidth = 2560,
    [int]$Quality = 92,
    [int]$TileSize = 128
)

$ErrorActionPreference = "Stop"

$Ffmpeg = "C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe"
$UpscaylBin = "tools\upscayl-repo\resources\win\bin\upscayl-bin.exe"
$ModelsDir = "tools\upscayl-repo\resources\models"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " VIDEO FRAME EXTRACTION & UPSCAYL AI WEB PIPELINE" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Verify prerequisites
if (-not (Test-Path $Ffmpeg)) {
    throw "FFmpeg binary not found at $Ffmpeg"
}
if (-not (Test-Path $UpscaylBin)) {
    throw "Upscayl binary not found at $UpscaylBin"
}
if (-not (Test-Path $ModelsDir)) {
    throw "Models directory not found at $ModelsDir"
}

# Create required output directories
$TempLight = "temp_extract\light"
$TempDark = "temp_extract\dark"
$OutLight = Join-Path $OutputBase "light_mode"
$OutDark = Join-Path $OutputBase "dark_mode"
$FrontLight = Join-Path $FrontendBase "light"
$FrontDark = Join-Path $FrontendBase "dark"

@($TempLight, $TempDark, $OutLight, $OutDark, $FrontLight, $FrontDark) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}

# Function to process one video
function Process-Mode {
    param(
        [string]$ModeName,
        [string]$VideoFile,
        [string]$TempDir,
        [string]$OutputDir,
        [string]$FrontendDir
    )

    Write-Host "`n>>> [STEP 1/3] Extracting frames for $ModeName ($VideoFile)..." -ForegroundColor Yellow
    Get-ChildItem -Path $TempDir -Filter "*.png" | Remove-Item -Force -ErrorAction SilentlyContinue
    
    & $Ffmpeg -y -i $VideoFile -fps_mode passthrough "$TempDir\frame_%04d.png"
    
    $extractedCount = (Get-ChildItem -Path $TempDir -Filter "*.png").Count
    Write-Host "Extracted $extractedCount frames to $TempDir." -ForegroundColor Green

    Write-Host "`n>>> [STEP 2/3] Upscaling & WebP Optimizing with Upscayl AI engine ($ModeName)..." -ForegroundColor Yellow
    Get-ChildItem -Path $OutputDir -Filter "*.webp" | Remove-Item -Force -ErrorAction SilentlyContinue

    & $UpscaylBin -i $TempDir -o $OutputDir -m $ModelsDir -n "upscayl-lite-4x" -t $TileSize -f webp -c $Quality -w $TargetWidth

    $upscaledCount = (Get-ChildItem -Path $OutputDir -Filter "*.webp").Count
    Write-Host "Generated $upscaledCount enhanced 2K Quad HD WebP frames in $OutputDir." -ForegroundColor Green

    # Create manifest
    $manifest = @{
        mode = $ModeName
        totalFrames = $upscaledCount
        fps = 24
        width = $TargetWidth
        height = [int]($TargetWidth * 9 / 16)
        format = "webp"
        filePattern = "frame_%04d.webp"
        compressionQuality = $Quality
        generatedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 4

    Set-Content -Path (Join-Path $OutputDir "manifest.json") -Value $manifest -Encoding UTF8

    Write-Host "`n>>> [STEP 3/3] Mirroring frames to Frontend Public ($FrontendDir)..." -ForegroundColor Yellow
    Copy-Item -Path "$OutputDir\*" -Destination $FrontendDir -Recurse -Force
    Write-Host "Successfully mirrored $ModeName frames to $FrontendDir." -ForegroundColor Green
}

# Execute Light Mode
Process-Mode -ModeName "light" `
             -VideoFile $LightVideo `
             -TempDir $TempLight `
             -OutputDir $OutLight `
             -FrontendDir $FrontLight

# Execute Dark Mode
Process-Mode -ModeName "dark" `
             -VideoFile $DarkVideo `
             -TempDir $TempDark `
             -OutputDir $OutDark `
             -FrontendDir $FrontDark

# Clean temporary extracted PNGs to save space
Write-Host "`nCleaning temporary extraction files..." -ForegroundColor Cyan
Remove-Item -Path "temp_extract" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n=============================================" -ForegroundColor Green
Write-Host " ALL FRAMES EXTRACTED, ENHANCED & OPTIMIZED! " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\gilmi\.gemini\antigravity\brain\39b24c67-8bf7-4b54-9be2-1674afa496e4\.user_uploaded\media_1792980475648_17abaaa8.jpg"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source image not found: $srcPath"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($srcPath)

New-Item -ItemType Directory -Force -Path "src\assets" | Out-Null
New-Item -ItemType Directory -Force -Path "build" | Out-Null

function Resize-Image($img, [int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose()
    return $bmp
}

function Image-ToPngBytes($bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Dispose()
    return $bytes
}

# 1. Save 512x512 PNG to src/assets/logo.png and build/icon.png
$bmp512 = Resize-Image $srcImg 512 512
$bmp512.Save("src\assets\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp512.Save("build\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp512.Dispose()

# 2. Build multi-resolution icon.ico with sizes: 256, 128, 64, 48, 32, 16
$sizes = @(256, 128, 64, 48, 32, 16)
$pngList = New-Object System.Collections.ArrayList

foreach ($sz in $sizes) {
    $resized = Resize-Image $srcImg $sz $sz
    $pngBytes = Image-ToPngBytes $resized
    $resized.Dispose()
    [void]$pngList.Add(@{ Size = $sz; Bytes = $pngBytes })
}

$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($icoStream)

# Header: reserved(2)=0, type(2)=1, count(2)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$pngList.Count)

$offset = 6 + (16 * $pngList.Count)

foreach ($item in $pngList) {
    $sz = [int]$item.Size
    $data = [byte[]]$item.Bytes
    $wByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
    $hByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

    $writer.Write($wByte)               # Width
    $writer.Write($hByte)               # Height
    $writer.Write([byte]0)              # Color count
    $writer.Write([byte]0)              # Reserved
    $writer.Write([uint16]1)            # Color planes
    $writer.Write([uint16]32)           # Bits per pixel
    $writer.Write([uint32]$data.Length) # Image data size
    $writer.Write([uint32]$offset)      # Image data offset

    $offset += $data.Length
}

foreach ($item in $pngList) {
    $data = [byte[]]$item.Bytes
    $writer.Write($data, 0, $data.Length)
}

$writer.Flush()
[System.IO.File]::WriteAllBytes("build\icon.ico", $icoStream.ToArray())
$writer.Dispose()
$icoStream.Dispose()

$srcImg.Dispose()

Write-Output "Successfully generated:"
Write-Output " - src/assets/logo.png (512x512, $([System.IO.FileInfo]::new('src\assets\logo.png').Length) bytes)"
Write-Output " - build/icon.png (512x512, $([System.IO.FileInfo]::new('build\icon.png').Length) bytes)"
Write-Output " - build/icon.ico (multi-resolution, $([System.IO.FileInfo]::new('build\icon.ico').Length) bytes)"

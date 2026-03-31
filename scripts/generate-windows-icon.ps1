param(
  [string]$OutputPath = "C:\Projects\Active\ShiftMgmt_V3.4\build\icon.ico",
  [string]$SourcePath = "C:\Projects\Active\ShiftMgmt_V3.4\src\renderer\assets\brand-logo-clean.png"
)

Add-Type -AssemblyName System.Drawing

$previewPath = [System.IO.Path]::ChangeExtension($OutputPath, ".png")
$outputDirectory = [System.IO.Path]::GetDirectoryName($OutputPath)

if (-not [System.IO.Directory]::Exists($outputDirectory)) {
  [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}

if (-not [System.IO.File]::Exists($SourcePath)) {
  throw "브랜드 로고 파일을 찾을 수 없습니다: $SourcePath"
}

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$logoBitmap = New-Object System.Drawing.Bitmap $SourcePath
$logoBitmap.MakeTransparent($logoBitmap.GetPixel(0, 0))
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$sourceSize = [Math]::Min($logoBitmap.Width, $logoBitmap.Height)
$sourceRect = New-Object System.Drawing.Rectangle 0, 0, $sourceSize, $sourceSize
$destinationRect = New-Object System.Drawing.Rectangle 18, 18, 220, 220
$haloRect = New-Object System.Drawing.Rectangle 34, 34, 188, 188
$haloPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$haloPath.AddEllipse($haloRect)
$haloBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($haloPath)
$haloBrush.CenterColor = [System.Drawing.Color]::FromArgb(22, 103, 188, 243)
$haloBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 103, 188, 243))

$graphics.FillEllipse($haloBrush, $haloRect)
$graphics.DrawImage($logoBitmap, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)

$bitmap.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)

$pngBytes = [System.IO.File]::ReadAllBytes($previewPath)
$stream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create)
$writer = New-Object System.IO.BinaryWriter($stream)

$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)
$writer.Write($pngBytes)
$writer.Flush()
$writer.Close()
$stream.Close()

if ($haloBrush) { $haloBrush.Dispose() }
if ($haloPath) { $haloPath.Dispose() }
if ($logoBitmap) { $logoBitmap.Dispose() }
if ($graphics) { $graphics.Dispose() }
if ($bitmap) { $bitmap.Dispose() }

Write-Output "ICON_OK source=$SourcePath output=$OutputPath preview=$previewPath"

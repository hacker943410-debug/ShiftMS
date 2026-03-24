param(
  [string]$OutputPath = "C:\Projects\Active\ShiftMgmt_V3.4\build\icon.ico"
)

Add-Type -AssemblyName System.Drawing

$previewPath = [System.IO.Path]::ChangeExtension($OutputPath, ".png")
$outputDirectory = [System.IO.Path]::GetDirectoryName($OutputPath)

if (-not [System.IO.Directory]::Exists($outputDirectory)) {
  [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$backgroundBounds = New-Object System.Drawing.Rectangle 16, 16, 224, 224
$backgroundPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 52
$diameter = $radius * 2

$backgroundPath.AddArc($backgroundBounds.X, $backgroundBounds.Y, $diameter, $diameter, 180, 90)
$backgroundPath.AddArc($backgroundBounds.Right - $diameter, $backgroundBounds.Y, $diameter, $diameter, 270, 90)
$backgroundPath.AddArc($backgroundBounds.Right - $diameter, $backgroundBounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
$backgroundPath.AddArc($backgroundBounds.X, $backgroundBounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
$backgroundPath.CloseFigure()

$gradientBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point -ArgumentList 0, 0),
  (New-Object System.Drawing.Point -ArgumentList 256, 256),
  ([System.Drawing.Color]::FromArgb(255, 48, 84, 184)),
  ([System.Drawing.Color]::FromArgb(255, 24, 50, 122))
)

$highlightBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(32, 255, 255, 255))
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 255, 255, 255), 2)
$font = New-Object System.Drawing.Font("Segoe UI", 84, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$subtitleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(210, 232, 239, 255))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center

$graphics.FillPath($gradientBrush, $backgroundPath)
$graphics.DrawPath($borderPen, $backgroundPath)
$graphics.FillEllipse($highlightBrush, 42, 34, 94, 62)

$textBounds = New-Object System.Drawing.RectangleF 20, 36, 216, 130
$subtitleBounds = New-Object System.Drawing.RectangleF 20, 160, 216, 36

$graphics.DrawString("SM", $font, $textBrush, $textBounds, $format)
$graphics.DrawString("SHIFT", $subtitleFont, $subtitleBrush, $subtitleBounds, $format)

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

if ($subtitleBrush) { $subtitleBrush.Dispose() }
if ($textBrush) { $textBrush.Dispose() }
if ($font) { $font.Dispose() }
if ($subtitleFont) { $subtitleFont.Dispose() }
if ($borderPen) { $borderPen.Dispose() }
if ($highlightBrush) { $highlightBrush.Dispose() }
if ($gradientBrush) { $gradientBrush.Dispose() }
if ($backgroundPath) { $backgroundPath.Dispose() }
if ($graphics) { $graphics.Dispose() }
if ($bitmap) { $bitmap.Dispose() }

Write-Output "ICON_OK output=$OutputPath preview=$previewPath"

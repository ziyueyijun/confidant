# Ticket-21 icon pipeline. Regenerable: tweak the source params below and rerun.
# Palette source of truth: src/renderer/src/index.css (--accent light #1f6fcf / dark #6aa9f2).
# NOTE: keep this file pure ASCII (Windows PowerShell 5.1 misreads UTF-8 comments).
param(
  [string]$OutIco = "build/icon.ico"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# ---- source params (design: accent-blue rounded square + white rounded card + text bars) ----
$bgTopHex    = "#2E7DE3"
$bgBottomHex = "#1558A5"
$cardHex     = "#FFFFFF"
$lineHex     = "#84B0E5"   # light accent ~50% over white
$accentHex   = "#1F6FCF"   # = light --accent in index.css
$sizes       = @(16, 20, 24, 32, 40, 48, 64, 128, 256)

function New-RoundedRectPath([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$pngs = @()
$tmp = Join-Path $env:TEMP "confidant-icon"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

foreach ($S in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($S, $S)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # background: accent-blue rounded square, vertical gradient
  $bgRect = New-Object System.Drawing.RectangleF(0, 0, $S, $S)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect,
    ([System.Drawing.ColorTranslator]::FromHtml($bgTopHex)),
    ([System.Drawing.ColorTranslator]::FromHtml($bgBottomHex)), 90.0)
  $bgPath = New-RoundedRectPath 0 0 $S $S ($S * 0.22)
  $g.FillPath($grad, $bgPath)

  # card: white rounded square with a hairline edge (light taskbar contrast)
  $pad  = [double]$S * 0.19
  $pw   = $S - 2 * $pad
  $card = New-RoundedRectPath $pad $pad $pw $pw ($S * 0.05)
  $g.FillPath([System.Drawing.Brushes]::White, $card)
  $edgePen = New-Object System.Drawing.Pen(([System.Drawing.ColorTranslator]::FromHtml("#D8E6F5")), [Math]::Max(1.0, $S * 0.008))
  $g.DrawPath($edgePen, $card)

  # text bars: two long + one short accent tail
  $barH = [Math]::Max(1.4, [double]$S * 0.045)
  $x0   = $pad + $pw * 0.15
  $y1   = $pad + $pw * 0.28
  $step = $pw * 0.17
  $lines = @(
    @{ len = 0.72; color = $lineHex },
    @{ len = 0.72; color = $lineHex },
    @{ len = 0.42; color = $accentHex }
  )
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $pen = New-Object System.Drawing.Pen(([System.Drawing.ColorTranslator]::FromHtml($lines[$i].color)), $barH)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $y = $y1 + $i * $step
    $g.DrawLine($pen, $x0, $y, $x0 + $pw * $lines[$i].len, $y)
    $pen.Dispose()
  }
  $edgePen.Dispose(); $grad.Dispose(); $bgPath.Dispose(); $card.Dispose(); $g.Dispose()

  $pngFile = Join-Path $tmp ("icon-{0}.png" -f $S)
  $bmp.Save($pngFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $pngs += $pngFile
}

# ---- compose ICO (PNG-in-ICO, fine on Win10/11 and electron-builder) ----
$count = $pngs.Count
$out = New-Object System.Collections.Generic.List[byte]
$out.AddRange([byte[]](0, 0, 1, 0))
$out.AddRange([BitConverter]::GetBytes([uint16]$count))

$offset = 6 + 16 * $count
$blobs = @()
foreach ($f in $pngs) {
  $img = [System.Drawing.Image]::FromFile($f)
  $w = $img.Width
  $img.Dispose()
  $bytes = [System.IO.File]::ReadAllBytes($f)
  $blobs += ,$bytes
  $sizeByte = if ($w -ge 256) { 0 } else { $w }
  $out.AddRange([byte[]]@($sizeByte, $sizeByte, 0, 0))
  $out.AddRange([BitConverter]::GetBytes([uint16]1))
  $out.AddRange([BitConverter]::GetBytes([uint16]32))
  $out.AddRange([BitConverter]::GetBytes([uint32]$bytes.Length))
  $out.AddRange([BitConverter]::GetBytes([uint32]$offset))
  $offset += $bytes.Length
}
foreach ($b in $blobs) { $out.AddRange($b) }

$absOut = Join-Path (Get-Location) $OutIco
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($absOut)) | Out-Null
[System.IO.File]::WriteAllBytes($absOut, $out.ToArray())
Write-Host ("OK: {0}  ({1} sizes: {2}, {3} bytes)" -f $absOut, $count, ($sizes -join "/"), $out.Count)

# Ticket-21 icon pipeline, v2: Typora-style confidant icon (white card + black Z).
# Design source: the embedded 256px icon of the locally installed Typora exe,
# pixel-sampled (opaque A>128 silhouette and key colors). Card = near-full-bleed
# white rounded square: big rounded top corners, asymmetric bottom taper ending
# in a rounded tip (paper fold), light inner edge band on left/top, gray fold
# shading, down-right drop shadow. Letter = geometric Z in the T's bar language
# (miter joins, round caps, 20px bars, #2B2B2B), centered on the card.
# Pipeline renders a 4x master then downscales per size (smooth AA/shadows).
# Regenerable: tweak the source params below and rerun.
# NOTE: keep this file pure ASCII (Windows PowerShell 5.1 misreads UTF-8 comments).
param(
  [string]$OutIco = "build/icon.ico"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# ---- source params (lengths in 256px-reference units) ----
$sizes      = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$masterSize = 1024

$cardHex    = "#FDFDFD" # interior white (measured 252-254)
$letterHex  = "#2B2B2B" # letter black (measured 43,43,43)
$letterW    = 20.0      # Z bar width = T stem width @256
$letterPts  = @(@(84.0, 65.0), @(184.0, 65.0), @(74.0, 180.0), @(174.0, 180.0))
$edgeBands  = @(
  @{ w = 16.0; hex = "#D6D6D6" },  # inner band: LEFT edge only (paper edge shadow)
  @{ w = 6.0;  hex = "#E4E4E4" }   # thin light rim: left/right/bottom (not top)
)
$edgeClipX  = 230.0  # band only left of this x (right edge has no inner band)
$topSkipY   = 60.0   # no band above this y except the left strip (top edge is clean)
$topSkipX   = 35.0   # ...left strip boundary at the top corners
$shadow     = @(
  @{ dx = 0.0; dy = 1.0;  a = 50 },
  @{ dx = 1.0; dy = 4.0;  a = 38 },
  @{ dx = 2.0; dy = 8.0;  a = 20 },
  @{ dx = 3.0; dy = 12.0; a = 8 }
)
# fold gradient over card rows 0..250 (normalized stops; colors per sampling)
$foldStops  = @(0.00, 0.90, 0.92, 0.936, 0.944, 0.952, 0.960, 0.968, 0.976, 0.984, 0.992, 1.00)
$foldHex    = @("#FDFDFD", "#FDFDFD", "#F8F8F8", "#F3F3F3", "#BFBFBF", "#CACACA", "#D7D7D7", "#E4E4E4", "#E9E9E9", "#EFEFEF", "#DDDDDD", "#DDDDDD")

# card silhouette: per-row opaque left/right edges (A>128 at 256px), y = 4..249
$cardL = @(66,60,56,53,51,48,47,45,43,42,40,39,38,37,36,35,34,33,32,31,31,30,29,27,26,24,23,22,21,20,19,18,17,16,15,14,14,13,12,12,11,11,10,9,9,9,8,8,7,7,
7,7,6,6,6,6,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6,6,7,7,7,7,7,7,
7,7,7,8,8,8,8,8,8,8,8,8,8,9,9,9,9,9,9,9,9,9,10,10,10,10,10,10,10,10,10,10,11,11,11,11,11,11,11,11,11,12,12,12,12,12,12,12,12,12,
12,13,13,13,13,13,13,13,13,13,14,14,14,14,14,14,14,14,14,15,15,15,15,15,15,15,15,15,16,16,16,16,16,16,16,16,16,17,17,17,17,17,17,17,17,18,18,18,18,18,
18,18,19,19,19,19,20,20,20,20,21,21,21,22,22,22,23,23,24,24,25,25,26,27,27,28,29,30,30,31,32,33,34,35,36,38,39,40,42,44,46,48,50,53,57,63,63)
$cardR = @(207,213,217,220,222,224,226,228,229,231,232,234,235,236,237,238,239,240,240,241,242,243,243,244,245,245,246,246,247,247,248,248,248,249,249,249,250,250,250,250,251,251,251,251,251,251,251,252,252,252,
252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,
252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,
252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,252,251,251,251,251,251,251,251,250,250,250,250,249,249,249,248,
248,247,247,247,246,246,245,244,244,243,242,242,241,240,239,238,238,237,235,234,233,232,231,229,227,226,224,222,219,216,212,207,201,194,185,175,166,156,146,137,127,118,108,99,89,78,78)

$k = $masterSize / 256.0

function New-CardPath([double]$s) {
  $n = $cardL.Count * 2
  $pts = New-Object "System.Drawing.PointF[]" $n
  $i = 0
  foreach ($y in 4..($cardL.Count + 3)) {
    $pts[$i++] = New-Object System.Drawing.PointF ($cardL[$y - 4] * $s), ($y * $s)
  }
  for ($y = $cardR.Count + 3; $y -ge 4; $y--) {
    $pts[$i++] = New-Object System.Drawing.PointF ($cardR[$y - 4] * $s), ($y * $s)
  }
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  $p.AddLines($pts)
  $p.CloseFigure()
  return $p
}

# ---- render 4x master ----
$master = New-Object System.Drawing.Bitmap($masterSize, $masterSize)
$g = [System.Drawing.Graphics]::FromImage($master)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$cardPath = New-CardPath $k

# drop shadow: card shape offset down-right, low alpha copies (behind the card)
foreach ($s in $shadow) {
  $p = New-CardPath $k
  $mx = New-Object System.Drawing.Drawing2D.Matrix
  $mx.Translate([single]($s.dx * $k), [single]($s.dy * $k))
  $p.Transform($mx)
  $br = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($s.a, 0, 0, 0))
  $g.FillPath($br, $p)
  $br.Dispose(); $mx.Dispose(); $p.Dispose()
}

# card fill
$g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($cardHex))), $cardPath)

# edge bands: wide pen clipped to card minus right strip and top strip (the
# top edge of the card is clean white in the source; the band is a left-edge
# inner shadow from top-left lighting). Narrow pens on the complex path vanish
# under region clips, so the thin rim is drawn under a plain card clip minus
# the top strip only.
$ecx = [single]($edgeClipX * $k)
$topY = [single]($topSkipY * $k)
$topX = [single]($topSkipX * $k)
$clip = New-Object System.Drawing.Drawing2D.GraphicsPath
$clip.AddRectangle((New-Object System.Drawing.RectangleF(0, 0, $ecx, $masterSize)))
$topSkip = New-Object System.Drawing.Drawing2D.GraphicsPath
$topSkip.AddRectangle((New-Object System.Drawing.RectangleF($topX, 0, ($masterSize - $topX), $topY)))
$g.SetClip($cardPath, [System.Drawing.Drawing2D.CombineMode]::Intersect)
$g.SetClip($clip, [System.Drawing.Drawing2D.CombineMode]::Intersect)
$g.SetClip($topSkip, [System.Drawing.Drawing2D.CombineMode]::Exclude)
$g.DrawPath((New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($edgeBands[0].hex), [single]($edgeBands[0].w * $k))), $cardPath)
$g.ResetClip()
$g.SetClip($cardPath)
$g.SetClip($topSkip, [System.Drawing.Drawing2D.CombineMode]::Exclude)
$g.DrawPath((New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($edgeBands[1].hex), [single]($edgeBands[1].w * $k))), $cardPath)
$g.ResetClip()

# fold shading: vertical gradient clipped to the card, fold rows only (y>=228)
# (an unclipped fill would repaint the whole card and wipe the edge bands)
$foldClip = New-Object System.Drawing.Drawing2D.GraphicsPath
$foldClip.AddRectangle((New-Object System.Drawing.RectangleF(0, [single](228 * $k), $masterSize, [single](28 * $k))))
$g.SetClip($cardPath, [System.Drawing.Drawing2D.CombineMode]::Intersect)
$g.SetClip($foldClip, [System.Drawing.Drawing2D.CombineMode]::Intersect)
$fk = [single](250 * $k)
$foldRect = New-Object System.Drawing.RectangleF(0, 0, $masterSize, $fk)
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($foldRect,
  [System.Drawing.Color]::White, [System.Drawing.Color]::White, 90.0)
$blend = New-Object System.Drawing.Drawing2D.ColorBlend($foldStops.Count)
$blend.Positions = [float[]]$foldStops
$cols = New-Object "System.Drawing.Color[]" $foldHex.Count
for ($i = 0; $i -lt $foldHex.Count; $i++) { $cols[$i] = [System.Drawing.ColorTranslator]::FromHtml($foldHex[$i]) }
$blend.Colors = $cols
$grad.InterpolationColors = $blend
$g.FillPath($grad, $cardPath)
$g.ResetClip()

# letter Z: one polyline, miter joins, round caps (geometric Z in T's bar language)
$pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($letterHex), [single]($letterW * $k))
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pts = New-Object "System.Drawing.PointF[]" $letterPts.Count
for ($i = 0; $i -lt $letterPts.Count; $i++) {
  $pts[$i] = New-Object System.Drawing.PointF ([single]($letterPts[$i][0] * $k)), ([single]($letterPts[$i][1] * $k))
}
$g.DrawLines($pen, $pts)
$pen.Dispose()

$grad.Dispose(); $clip.Dispose(); $cardPath.Dispose(); $g.Dispose()
$masterPath = Join-Path $env:TEMP "confidant-icon\master-1024.png"
New-Item -ItemType Directory -Force -Path (Split-Path $masterPath) | Out-Null
$master.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)

# ---- downscale per size ----
$pngs = @()
$tmp = Join-Path $env:TEMP "confidant-icon-new"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
foreach ($S in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($S, $S)
  $g2 = [System.Drawing.Graphics]::FromImage($bmp)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g2.DrawImage($master, 0, 0, $S, $S)
  $pngFile = Join-Path $tmp ("icon-{0}.png" -f $S)
  $bmp.Save($pngFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose(); $g2.Dispose()
  $pngs += $pngFile
}
$master.Dispose()

# ---- self-check: 256px render against the sampled Typora data ----
$chk = [System.Drawing.Bitmap]::FromFile((Join-Path $tmp "icon-256.png"))
function Get-OpaqueRow([int]$y) {
  $min = -1; $max = -1
  for ($x = 0; $x -lt 256; $x++) {
    if ($chk.GetPixel($x, $y).A -gt 128) { if ($min -lt 0) { $min = $x }; $max = $x }
  }
  return @($min, $max)
}
$maxDev = 0; $devRows = @()
for ($y = 4; $y -le 249; $y++) {
  $r = Get-OpaqueRow $y
  $d1 = [Math]::Abs($r[0] - $cardL[$y - 4]); $d2 = [Math]::Abs($r[1] - $cardR[$y - 4])
  $d = [Math]::Max($d1, $d2)
  if ($d -gt $maxDev) { $maxDev = $d }
  if ($d -gt 2) { $devRows += ("y{0}:L{1}/{2} R{3}/{4}" -f $y, $r[0], $cardL[$y - 4], $r[1], $cardR[$y - 4]) }
}
function Pix([int]$x, [int]$y) {
  $c = $chk.GetPixel($x, $y); return ("{0},{1},{2},{3}" -f $c.R, $c.G, $c.B, $c.A)
}
Write-Host ("[check] silhouette max dev vs Typora: {0}px {1}" -f $maxDev, $(if ($devRows.Count) { "(rows: " + ($devRows -join "; ") + ")" } else { "(all within 2px)" }))
Write-Host ("[check] white   (129,210)  {0}" -f (Pix 129 210))
Write-Host ("[check] white   (40,150)   {0}" -f (Pix 40 150))
Write-Host ("[check] edge    (22,210)   {0}" -f (Pix 22 210))
Write-Host ("[check] edge    (27,210)   {0}" -f (Pix 27 210))
Write-Host ("[check] fold    (129,236)  {0}" -f (Pix 129 236))
Write-Host ("[check] fold    (129,242)  {0}" -f (Pix 129 242))
Write-Host ("[check] letter  (129,65)   {0}" -f (Pix 129 65))
Write-Host ("[check] letter  (129,126)  {0}" -f (Pix 129 126))
Write-Host ("[check] letter  (100,65)   {0}" -f (Pix 100 65))
Write-Host ("[check] letter  (129,175)  {0}" -f (Pix 129 175))
Write-Host ("[check] white   (129,50)   {0}" -f (Pix 129 50))
# letter dark bbox (centering + miter check)
$bx0 = 999; $bx1 = -1; $by0 = 999; $by1 = -1
for ($y = 40; $y -le 205; $y += 2) {
  for ($x = 40; $x -le 220; $x += 2) {
    $c = $chk.GetPixel($x, $y)
    if ($c.R -lt 100 -and $c.A -gt 128) {
      if ($x -lt $bx0) { $bx0 = $x }; if ($x -gt $bx1) { $bx1 = $x }
      if ($y -lt $by0) { $by0 = $y }; if ($y -gt $by1) { $by1 = $y }
    }
  }
}
Write-Host ("[check] letter dark bbox: x {0}..{1} (center {2}), y {3}..{4} (center {5})" -f $bx0, $bx1, [Math]::Round(($bx0 + $bx1) / 2, 1), $by0, $by1, [Math]::Round(($by0 + $by1) / 2, 1))
# 16px legibility: dark pixel count in the letter box
$d16 = [System.Drawing.Bitmap]::FromFile((Join-Path $tmp "icon-16.png"))
$cnt = 0
for ($y = 1; $y -lt 15; $y++) { for ($x = 1; $x -lt 15; $x++) { if ($d16.GetPixel($x, $y).R -lt 128) { $cnt++ } } }
Write-Host ("[check] 16px dark pixels in letter box: {0} (legible if >= 6)" -f $cnt)
$d16.Dispose(); $chk.Dispose()

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
  $blobs += , $bytes
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

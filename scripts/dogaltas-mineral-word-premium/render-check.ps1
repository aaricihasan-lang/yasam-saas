# Mineral Bankası Word örneklerini GERÇEK Microsoft Word düzeninde denetler (Word COM).
#
# Kullanım: powershell -File render-check.ps1 -Dir <örnek-klasörü> [-Pdf]
#
# Her .docx için: alanlar (PAGEREF / PAGE / NUMPAGES) güncellenir, sayfa sayısı Word'ün kendi
# sayfalamasıyla ölçülür, sayfa başına gövde metni çıkarılır (boş / neredeyse boş sayfa tespiti),
# sayfa sonunda yalnız kalan mineral başlığı (yetim başlık) aranır ve <ad>.expect.json içindeki
# bütün beklenen metinlerin Word metninde bulunduğu doğrulanır. -Pdf verilirse PDF önizleme üretilir.
# Sonuç: <klasör>\render-report.json + konsol özeti. Word belgeyi değiştirmez (salt-okunur açılır).
param(
  [Parameter(Mandatory = $true)][string]$Dir,
  [switch]$Pdf
)
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$results = @()
try {
  foreach ($f in Get-ChildItem -Path $Dir -Filter *.docx | Sort-Object Name) {
    $doc = $word.Documents.Open($f.FullName, $false, $true, $false)
    try {
      [void]$doc.Fields.Update()
      foreach ($s in $doc.Sections) { foreach ($ft in $s.Footers) { [void]$ft.Range.Fields.Update() } }
      $doc.Repaginate()
      $pages = $doc.ComputeStatistics(2)
      $starts = @()
      for ($i = 1; $i -le $pages; $i++) { $starts += $doc.GoTo(1, 1, $i).Start }
      $end = $doc.Content.End
      $pageChars = @()
      $orphans = @()
      $gaps = @()
      for ($i = 0; $i -lt $pages; $i++) {
        $s0 = $starts[$i]
        $e0 = if ($i + 1 -lt $pages) { $starts[$i + 1] } else { $end }
        $t = $doc.Range($s0, $e0).Text
        $pageChars += (($t -replace '[\s\r\n\a\x07\x0c]', '').Length)
        if ($i + 1 -lt $pages) {
          # Sayfa dibi boşluğu: son satırın dikey konumu → kullanılabilir yüksekliğin boş kalan oranı.
          $ps = $doc.Range($s0, $s0).Sections(1).PageSetup
          $usable = $ps.PageHeight - $ps.TopMargin - $ps.BottomMargin
          $y = $doc.Range($e0 - 1, $e0 - 1).Information(6)
          $gap = [math]::Round((($ps.PageHeight - $ps.BottomMargin) - $y) / $usable * 100)
          $gaps += $gap
          # Sayfanın son dolu paragrafı bir mineral başlık bandı mı?
          $p = $doc.Range($e0 - 1, $e0 - 1).Paragraphs(1)
          $guard = 0
          while ($p -ne $null -and (($p.Range.Text -replace '[\s\r\n\a\x07\x0c]', '').Length -eq 0) -and $guard -lt 5) {
            $p = $p.Previous(1); $guard++
          }
          if ($p -ne $null) {
            $style = [string]$p.Style.NameLocal
            $txt = ($p.Range.Text -replace '[\r\n\a\x07]', '').Trim()
            if ($style -match 'Heading|Başlık' -or $txt -match '^MİNERAL #\d+') { $orphans += "s$($i + 1): [$style] $txt" }
          }
        }
      }
      $text = $doc.Content.Text
      $missing = @()
      $expFile = [IO.Path]::ChangeExtension($f.FullName, ".expect.json")
      if (Test-Path $expFile) {
        $exp = Get-Content $expFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $norm = ($text -replace '[\r\n\a\x07\x0b\x0c]', ' ') -replace '\s+', ' '
        foreach ($e in $exp.texts) { $en = ($e -replace '\s+', ' ').Trim(); if ($en -and -not $norm.Contains($en)) { $missing += $en } }
      }
      $broken = ($text -match ([char]0x0307)) -or ($text -match 'Ã|Ä±|Å') -or ($text -match ([char]0xFFFD))
      if ($Pdf) { $doc.ExportAsFixedFormat([IO.Path]::ChangeExtension($f.FullName, ".pdf"), 17) }
      $results += [pscustomobject]@{
        file = $f.Name; pages = $pages; pageChars = ($pageChars -join ","); minPageChars = ($pageChars | Measure-Object -Minimum).Minimum
        emptyPages = @($pageChars | Where-Object { $_ -lt 40 }).Count; orphanHeadings = ($orphans -join " | "); missing = $missing.Count
        gapPct = ($gaps -join ","); bigGaps = (@(for ($g = 0; $g -lt $gaps.Count; $g++) { if ($gaps[$g] -ge 35) { "s$($g + 1)=$($gaps[$g])%" } }) -join " ")
        missingSample = (($missing | Select-Object -First 3) -join " | "); brokenChars = $broken
      }
    } finally { $doc.Close(0) }
  }
} finally { $word.Quit() }
$results | ConvertTo-Json -Depth 3 | Out-File -FilePath (Join-Path $Dir "render-report.json") -Encoding utf8
$results | Format-Table file, pages, emptyPages, missing, brokenChars, orphanHeadings, bigGaps -AutoSize | Out-String -Width 250

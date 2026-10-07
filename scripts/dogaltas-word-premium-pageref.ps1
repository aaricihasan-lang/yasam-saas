# Doğaltaş Mineral/Kombinasyon Word — İçindekiler sayfa no GERÇEK doğrulaması (Word COM).
# Her DOCX: alanları güncelle → her PAGEREF sonucu = ilgili yer iminin GERÇEK sayfası mı?
# Ayrıca: toplam sayfa, İçindekiler'in bulunduğu sayfa, boş sayfa (yalnız boşluk) taraması.
# Kullanım: powershell -File scripts/dogaltas-word-premium-pageref.ps1 -Dir <docx klasörü>
param([string]$Dir)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path $Dir).Path
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
$fail = 0
try {
  Get-ChildItem -Path $root -Filter *.docx | Sort-Object Name | ForEach-Object {
    $doc = $word.Documents.Open($_.FullName, $false, $true)
    try {
      $doc.Repaginate()
      [void]$doc.Fields.Update()
      $pages = [int]$doc.ComputeStatistics(2)
      $refs = 0; $bad = 0; $blank = 0; $samples = @()
      foreach ($f in $doc.Fields) {
        $code = $f.Code.Text.Trim()
        if ($code -match '^PAGEREF\s+(\S+)') {
          $refs++
          $name = $Matches[1]
          $shown = $f.Result.Text.Trim()
          if (-not $doc.Bookmarks.Exists($name)) { $bad++; $samples += "$name:yok"; continue }
          $actual = [int]$doc.Bookmarks.Item($name).Range.Information(3)
          if ($shown -eq "") { $blank++ }
          elseif ([int]$shown -ne $actual) { $bad++; if ($samples.Count -lt 3) { $samples += "${name}:${shown}!=${actual}" } }
        }
      }
      # Boş sayfa: metni yalnız boşluk olan sayfa
      $emptyPages = @()
      for ($p = 1; $p -le $pages; $p++) {
        $start = $doc.GoTo(1, 1, $p).Start
        $end = if ($p -lt $pages) { $doc.GoTo(1, 1, $p + 1).Start } else { $doc.Content.End }
        $txt = $doc.Range($start, $end).Text
        if (($txt -replace '[\s\x07\x0c]', '').Length -eq 0) { $emptyPages += $p }
      }
      $status = if ($bad -eq 0 -and $blank -eq 0 -and $emptyPages.Count -eq 0) { "PASS" } else { $fail++; "FAIL" }
      Write-Output ("{0} {1,-26} sayfa={2,-4} pageref={3,-4} yanlis={4} bos_no={5} bos_sayfa=[{6}] {7}" -f $status, $_.BaseName, $pages, $refs, $bad, $blank, ($emptyPages -join ","), ($samples -join " "))
    } finally { $doc.Close(0) }
  }
} finally { $word.Quit() }
Write-Output ("SONUC_FAIL={0}" -f $fail)

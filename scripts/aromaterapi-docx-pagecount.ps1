# Aromaterapi DOCX — gerçek sayfa sayısı (Word COM, hızlı/güvenli). Selection/PDF YOK.
param([string]$Dir = "aroma-docx-uat-layout-v2")
$ErrorActionPreference = "Continue"
$root = (Resolve-Path $Dir).Path
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
$results = @()
Get-ChildItem -Path $root -Filter *.docx | Sort-Object Name | ForEach-Object {
  $doc = $word.Documents.Open($_.FullName, $false, $true)
  try { foreach ($toc in $doc.TablesOfContents) { $toc.Update() } } catch {}
  try { $doc.Repaginate() } catch {}
  $pages = [int]$doc.ComputeStatistics(2)
  $doc.Close(0)
  $results += [pscustomobject]@{ File = $_.BaseName; Pages = $pages }
  Write-Output ("{0,-26} {1}" -f $_.BaseName, $pages)
}
$word.Quit()
$results | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $root "page-report.json")
Write-Output ("TOPLAM={0}" -f ($results | Measure-Object -Property Pages -Sum).Sum)

# Aromaterapi DOCX → PDF (Word COM). TOC güncelle → repaginate → PDF. Selection YOK.
param([string]$Dir = "aroma-docx-uat-layout-v2")
$ErrorActionPreference = "Continue"
$root = (Resolve-Path $Dir).Path
$pdfDir = Join-Path $root "pdf"; New-Item -ItemType Directory -Force -Path $pdfDir | Out-Null
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
Get-ChildItem -Path $root -Filter *.docx | Sort-Object Name | ForEach-Object {
  $out = Join-Path $pdfDir ($_.BaseName + ".pdf")
  $doc = $word.Documents.Open($_.FullName, $false, $true)
  try { foreach ($toc in $doc.TablesOfContents) { $toc.Update() } } catch {}
  try { $doc.Repaginate() } catch {}
  try { $doc.ExportAsFixedFormat($out, 17); Write-Output ("PDF  {0}" -f $_.BaseName) } catch { Write-Output ("FAIL {0}: {1}" -f $_.BaseName, $_) }
  $doc.Close(0)
}
$word.Quit()
Write-Output "done"

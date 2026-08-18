# Aromaterapi DOCX → PDF (readonly; cached TOC'yi olduğu gibi render eder — güncelleme YOK).
param([Parameter(Mandatory=$true)][string]$File,[Parameter(Mandatory=$true)][string]$Out)
$ErrorActionPreference = "Continue"
$word = $null; $doc = $null; $wdDoNotSave = 0
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false; $word.DisplayAlerts = 0
  # rw aç (updateFields=true → Word alanları bellek içinde günceller; DOCX'i KAYDETMEYİZ →
  # diskteki cached TOC korunur). Close(0) = değişiklik kaydetme.
  $doc = $word.Documents.Open((Resolve-Path $File).Path, $false, $false)
  $pages = [int]$doc.ComputeStatistics(2)
  $doc.ExportAsFixedFormat($Out, 17)
  Write-Output "PDF PAGES=$pages"
} catch {
  Write-Output "PDF_ERROR: $($_.Exception.Message)"
} finally {
  if ($doc -ne $null) { try { $doc.Close($wdDoNotSave) } catch {} }
  if ($word -ne $null) { try { $word.Quit() } catch {} }
}

# Aromaterapi DOCX — Word COM SAVE-BACK (TOC cache) ONLY (PDF ayrı adımda).
# aç(rw) → story field'ları + TOC güncelle → repaginate → Save → close → quit.
param([Parameter(Mandatory=$true)][string]$File)
$ErrorActionPreference = "Continue"
$word = $null; $doc = $null; $wdDoNotSave = 0
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false; $word.DisplayAlerts = 0
  try { $word.Options.UpdateFieldsAtPrint = $false } catch {}
  $doc = $word.Documents.Open((Resolve-Path $File).Path, $false, $false)
  if ($doc.ReadOnly) { throw "opened read-only" }
  foreach ($story in $doc.StoryRanges) { try { $story.Fields.Update() | Out-Null } catch {} }
  try { $doc.Fields.Update() | Out-Null } catch {}
  foreach ($toc in $doc.TablesOfContents) { try { $toc.Update() } catch {}; try { $toc.UpdatePageNumbers() } catch {} }
  try { $doc.Repaginate() } catch {}
  $pages = [int]$doc.ComputeStatistics(2)
  $doc.Save()
  Write-Output "SAVED PAGES=$pages"
} catch {
  Write-Output "SAVE_ERROR: $($_.Exception.Message)"
} finally {
  if ($doc -ne $null) { try { $doc.Close($wdDoNotSave) } catch {} }
  if ($word -ne $null) { try { $word.Quit() } catch {} }
}

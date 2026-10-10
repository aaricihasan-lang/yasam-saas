# HD Word önizleme: DOCX → PDF (Microsoft Word COM, gerçek sayfa düzeni) → PNG (PyMuPDF).
# Kullanım: powershell -File scripts/hd-word-report/docx-to-png.ps1 -Dir <klasör>
param([Parameter(Mandatory = $true)][string]$Dir)
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  Get-ChildItem -Path $Dir -Filter *.docx | ForEach-Object {
    $pdf = [System.IO.Path]::ChangeExtension($_.FullName, ".pdf")
    $doc = $word.Documents.Open($_.FullName, $false, $true)
    $doc.ExportAsFixedFormat($pdf, 17)  # wdExportFormatPDF
    $pages = $doc.ComputeStatistics(2)  # wdStatisticPages
    $doc.Close($false)
    Write-Output "$($_.Name): $pages sayfa"
  }
} finally {
  $word.Quit()
}
python -c @"
import sys, glob, os, pymupdf
d = sys.argv[1]
for pdf in glob.glob(os.path.join(d, '*.pdf')):
    doc = pymupdf.open(pdf)
    base = os.path.splitext(pdf)[0]
    for i, p in enumerate(doc):
        p.get_pixmap(dpi=110).save(f'{base}-s{i+1:02d}.png')
    print(os.path.basename(pdf), len(doc), 'sayfa PNG')
"@ $Dir

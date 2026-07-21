# reload_excel.ps1
# Перезагружает открытый Excel-файл data.xlsx, если он открыт

$excelFile = "data.xlsx"
$fullPath = Resolve-Path $excelFile

try {
    $excel = [System.Runtime.Interopservices.Marshal]::GetActiveObject('Excel.Application')
    $found = $false
    foreach ($wb in $excel.Workbooks) {
        if ($wb.FullName -eq $fullPath) {
            $wb.RefreshAll()
            $wb.Save()
            $found = $true
            Write-Host "✅ Excel перезагружен: $fullPath"
            break
        }
    }
    if (-not $found) {
        Write-Host "ℹ️ Файл $fullPath не открыт в Excel."
    }
} catch {
    Write-Host "⚠️ Excel не запущен или ошибка доступа."
}
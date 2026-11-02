$root = "C:\Users\julia\Desktop\Proyectos web\triba"
$zip = Join-Path $root "triba-app.zip"

Remove-Item $zip -Force -ErrorAction SilentlyContinue

$items = Get-ChildItem -Path $root -Force | Where-Object {
  $_.Name -notin @('node_modules', '.git', 'dist', 'triba-app.zip', '.tmp-zip')
}

Write-Host "Zippeando:" $items.Count "items"
$items | ForEach-Object { Write-Host "  -> $($_.Name)" }

Compress-Archive -Path $items.FullName -DestinationPath $zip -Force

$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "triba-app.zip creado ($size MB)"

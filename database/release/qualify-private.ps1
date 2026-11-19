param(
    [Parameter(Mandatory)]
    [string]$BackupDirectory
)

$ErrorActionPreference = 'Stop'
$backup = (Resolve-Path -LiteralPath $BackupDirectory).Path
$repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
Push-Location -LiteralPath $repository
try {
    python -B database/local/backup/qualify_restore.py $backup --isolated-only
    if ($LASTEXITCODE -ne 0) { throw 'Restore e preflight falharam.' }

    python -B database/local/write-sandbox/run-geography.py --execute
    if ($LASTEXITCODE -ne 0) { throw 'Homologacao PostGIS falhou.' }

    python -B database/local/pcdf-sandbox/qualify.py --isolated-only
    if ($LASTEXITCODE -ne 0) { throw 'Homologacao SQL PCDF falhou.' }

    python -B database/local/write-sandbox/run-mutations.py --execute --next --pcdf
    if ($LASTEXITCODE -ne 0) { throw 'Homologacao integrada Next.js falhou.' }
} finally {
    Pop-Location
}

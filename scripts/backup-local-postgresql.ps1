param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z_][a-z0-9_]{0,62}$')][string]$AuthorizedAccount)
$ErrorActionPreference = 'Stop'
# The operator must already be authorized for this exact read/backup scope.
$previous = [Environment]::GetEnvironmentVariable('SENTINELA_LOCAL_BACKUP_PASSWORD','Process')
$pointer = [IntPtr]::Zero
$secret = $null
try {
    $secret = Read-Host 'Senha da conta existente autorizada (entrada oculta)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrEmpty($plain)) { throw 'Senha ausente; nenhuma tentativa realizada.' }
    $env:SENTINELA_LOCAL_BACKUP_PASSWORD = $plain
    $plain = $null
    & python -B database/local/backup/recover.py --execute --authorized-account $AuthorizedAccount
    if ($LASTEXITCODE -ne 0) { throw 'Procedimento interrompido. Preservar evidencias; sem repeticao automatica.' }
} finally {
    [Environment]::SetEnvironmentVariable('SENTINELA_LOCAL_BACKUP_PASSWORD',$previous,'Process')
    $plain = $null
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($null -ne $secret) { $secret.Dispose() }
}

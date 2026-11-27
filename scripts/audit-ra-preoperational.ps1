$ErrorActionPreference = 'Stop'
# Existing reader password only. No account/configuration changes or plaintext files.
$names = @('SENTINELA_LOCAL_READER_URL','SENTINELA_LOCAL_BIND','SENTINELA_AUTH_PROVIDER')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
$secret = $null
$pointer = [IntPtr]::Zero
try {
    $secret = Read-Host 'Senha existente de sentinela_local_reader (entrada oculta)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrEmpty($plain)) { throw 'Senha ausente; nenhuma tentativa efetuada.' }
    $env:SENTINELA_LOCAL_READER_URL = 'postgresql://sentinela_local_reader:' + [Uri]::EscapeDataString($plain) + '@127.0.0.1:5432/sentinela_dev_operacional'
    $plain = $null
    $env:SENTINELA_LOCAL_BIND = '127.0.0.1'
    $env:SENTINELA_AUTH_PROVIDER = 'local'
    & node --experimental-strip-types scripts/audit-ra-preoperational.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Auditoria interrompida; consultar evidencia sanitizada. Sem repeticao automatica.' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') }
    $plain = $null
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($null -ne $secret) { $secret.Dispose() }
}

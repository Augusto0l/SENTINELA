param([switch]$RepositoryOnly, [switch]$Interface)
$ErrorActionPreference = 'Stop'
# Password exists only in memory/environment of this process and its child.
$secretReader = Read-Host 'Senha existente da role sentinela_local_reader (entrada oculta)' -AsSecureString
$pointerReader = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretReader)
$namesReader = @('SENTINELA_LOCAL_READER_URL','SENTINELA_AUTH_PROVIDER','SENTINELA_LOCAL_BIND','NODE_ENV')
$previousReader = @{}
foreach ($nameReader in $namesReader) { $previousReader[$nameReader] = [Environment]::GetEnvironmentVariable($nameReader,'Process') }
try {
  $plainReader = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointerReader)
  $env:SENTINELA_LOCAL_READER_URL = 'postgresql://sentinela_local_reader:' + [Uri]::EscapeDataString($plainReader) + '@127.0.0.1:5432/sentinela_dev_operacional'
  $plainReader = $null
  $env:SENTINELA_AUTH_PROVIDER = 'local'
  $env:SENTINELA_LOCAL_BIND = '127.0.0.1'
  $env:NODE_ENV = 'development'
  if ($RepositoryOnly) {
    & node --conditions=react-server --experimental-strip-types (Join-Path $PSScriptRoot 'test-local-reader.mjs')
  } else {
    $argumentsReader = @('--execute')
    if ($Interface) { $argumentsReader += '--ui' }
    & node --conditions=react-server --experimental-strip-types (Join-Path $PSScriptRoot 'homologate-local-reader.mjs') @argumentsReader
  }
  if ($LASTEXITCODE -ne 0) { throw 'Teste de leitura não aprovado; nenhuma credencial será exibida.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointerReader)
  $secretReader.Dispose()
  foreach ($nameReader in $namesReader) { [Environment]::SetEnvironmentVariable($nameReader,$previousReader[$nameReader],'Process') }
}

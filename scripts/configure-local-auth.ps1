param([switch]$Reconfigure, [Guid]$AdministratorSubject)
$ErrorActionPreference = 'Stop'
# Run in your own terminal. Never supply passwords as command arguments.
$accountDirectory = Join-Path $env:USERPROFILE '.sentinela-local'
$accountFile = Join-Path $accountDirectory 'accounts.json'
$bindAdministrator = $PSBoundParameters.ContainsKey('AdministratorSubject')
if ($bindAdministrator -and $AdministratorSubject -eq [Guid]::Empty) { throw 'Use the approved institutional administrator UUID.' }
if ((Test-Path -LiteralPath $accountFile) -and -not $Reconfigure) { throw 'Configuration already exists. Use -Reconfigure to replace the three local accounts.' }
. (Join-Path $PSScriptRoot "local-auth-acl.ps1")
Protect-SentinelaLocalAccounts -Directory $accountDirectory
$accounts = @()
$previousOutputEncoding = $OutputEncoding
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  foreach ($role in @('Administrador', 'Operador', 'Analista')) {
    $email = (Read-Host "E-mail local: $role").Trim().ToLowerInvariant()
    $secret = Read-Host "Senha local: $role (minimo 4 caracteres)" -AsSecureString
    $confirm = Read-Host 'Confirme a senha' -AsSecureString
    $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
    try {
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
      $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
      if ($plain.Length -lt 4 -or $plain.Length -gt 1024 -or $plain -cne $confirmation) { throw 'Invalid password or confirmation.' }
      $account = @{ email = $email; role = $role; password = $plain }
      if ($role -eq 'Administrador' -and $bindAdministrator) { $account.subject = $AdministratorSubject.ToString() }
      $accounts += $account
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr)
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr)
      $plain = $null; $confirmation = $null
      $secret.Dispose(); $confirm.Dispose()
    }
  }
  # Anonymous stdin pipe: no secret in argv, environment, terminal output or disk.
  $helperArguments = @((Join-Path $PSScriptRoot 'write-local-accounts.mjs'), $accountFile)
  if ($Reconfigure) { $helperArguments += '--replace' }
  $accounts | ConvertTo-Json -Compress | & node @helperArguments
  if ($LASTEXITCODE -ne 0) { throw 'Configuration failed; no credentials printed.' }
  Write-Host 'Local configuration created. Configure the private file path as documented.'
} finally { $accounts = $null; $OutputEncoding = $previousOutputEncoding }

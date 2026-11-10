param([Parameter(Mandatory=$true)][string]$Directory, [switch]$SeedBroadAccess, [switch]$SimulateFailure, [switch]$InspectOnly)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../scripts/local-auth-acl.ps1')
$access = [Security.AccessControl.AccessControlSections]::Access
$file = Join-Path $Directory 'accounts.json'
if ($SeedBroadAccess) {
  foreach ($path in @($Directory, $file)) {
    $isDirectory = $path -eq $Directory
    $acl = if ($isDirectory) { [IO.Directory]::GetAccessControl($path,$access) } else { [IO.File]::GetAccessControl($path,$access) }
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545')), 'ReadAndExecute', 'Allow')))
    Set-SentinelaAccessDescriptor -Path $path -Descriptor $acl -Directory $isDirectory
  }
}
if ($SimulateFailure) {
  $rootBefore = [IO.Directory]::GetAccessControl($Directory,$access).GetSecurityDescriptorSddlForm($access)
  $fileBefore = [IO.File]::GetAccessControl($file,$access).GetSecurityDescriptorSddlForm($access)
  # Deterministic failure on the second target, after the file DACL was updated.
  $script:failedOnce = $false
  function Set-SentinelaAccessDescriptor {
    param([string]$Path, [Security.AccessControl.FileSystemSecurity]$Descriptor, [bool]$Directory)
    if ($Directory -and -not $script:failedOnce) { $script:failedOnce=$true; throw 'Synthetic DACL failure' }
    if ($Directory) { [IO.Directory]::SetAccessControl($Path,$Descriptor) } else { [IO.File]::SetAccessControl($Path,$Descriptor) }
  }
  $caught = $false
  try { Protect-SentinelaLocalAccounts -Directory $Directory } catch { $caught = $_.Exception.Message -like '*previous DACLs restored*' }
  if (-not $caught -or $rootBefore -ne [IO.Directory]::GetAccessControl($Directory,$access).GetSecurityDescriptorSddlForm($access) -or $fileBefore -ne [IO.File]::GetAccessControl($file,$access).GetSecurityDescriptorSddlForm($access)) { throw 'Rollback test failed' }
  '{"rollback":true}'
  exit 0
}
if (-not $InspectOnly) { Protect-SentinelaLocalAccounts -Directory $Directory }
$result = @()
foreach ($path in @($Directory,$file)) {
  if (-not (Test-Path -LiteralPath $path)) { continue }
  $acl = if ($path -eq $Directory) { [IO.Directory]::GetAccessControl($path,$access) } else { [IO.File]::GetAccessControl($path,$access) }
  $rules = @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object {
    @{ sid=$_.IdentityReference.Value; allow=($_.AccessControlType -eq 'Allow'); full=(($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) }
  })
  $result += @{ directory=($path -eq $Directory); protected=$acl.AreAccessRulesProtected; rules=$rules }
}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
@{ user=$identity.User.Value; administrator=([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); targets=$result } | ConvertTo-Json -Depth 6 -Compress

# Windows PowerShell 5.1 / .NET Framework. Never read or persist Audit, Owner or Group.
function Set-SentinelaAccessDescriptor {
  param([string]$Path, [Security.AccessControl.FileSystemSecurity]$Descriptor, [bool]$Directory)
  if ($Directory) { [IO.Directory]::SetAccessControl($Path, $Descriptor) }
  else { [IO.File]::SetAccessControl($Path, $Descriptor) }
}

function Protect-SentinelaLocalAccounts {
  param([Parameter(Mandatory=$true)][string]$Directory)
  $root = [IO.Path]::GetFullPath($Directory)
  if ([IO.Path]::GetFileName($root) -ne '.sentinela-local' -or -not [IO.Directory]::Exists([IO.Path]::GetDirectoryName($root))) {
    throw 'Unexpected local accounts directory.'
  }
  $file = Join-Path $root 'accounts.json'
  $access = [Security.AccessControl.AccessControlSections]::Access
  $userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  # Protected DACL: current user, SYSTEM and built-in Administrators only.
  $directorySddl = 'D:P(A;OICI;FA;;;' + $userSid + ')(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)'
  $fileSddl = 'D:P(A;;FA;;;' + $userSid + ')(A;;FA;;;SY)(A;;FA;;;BA)'
  $targets = @()
  # Preflight every existing target before changing any DACL. No traversal or recursion.
  foreach ($path in @($file, $root)) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $attributes = [IO.File]::GetAttributes($path)
    if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked local accounts targets are not supported.' }
    $isDirectory = ($attributes -band [IO.FileAttributes]::Directory) -ne 0
    if (($path -eq $root) -ne $isDirectory) { throw 'Unexpected local accounts target type.' }
    $descriptor = if ($isDirectory) { [IO.Directory]::GetAccessControl($path, $access) } else { [IO.File]::GetAccessControl($path, $access) }
    $before = $descriptor.GetSecurityDescriptorSddlForm($access)
    $descriptor.SetSecurityDescriptorSddlForm($(if ($isDirectory) { $directorySddl } else { $fileSddl }), $access)
    $targets += @{ Path=$path; Descriptor=$descriptor; Directory=$isDirectory; Before=$before }
  }
  if (-not [IO.Directory]::Exists($root)) {
    $descriptor = New-Object Security.AccessControl.DirectorySecurity
    $descriptor.SetSecurityDescriptorSddlForm($directorySddl, $access)
    # Create with the private DACL, rather than create broadly and tighten later.
    [IO.Directory]::CreateDirectory($root, $descriptor) | Out-Null
    return
  }
  $applied = @()
  try {
    foreach ($target in $targets) {
      Set-SentinelaAccessDescriptor -Path $target.Path -Descriptor $target.Descriptor -Directory $target.Directory
      $applied += $target
    }
  } catch {
    $rollbackFailed = $false
    for ($i=$applied.Count-1; $i -ge 0; $i--) {
      $target = $applied[$i]
      try {
        $restore = if ($target.Directory) { [IO.Directory]::GetAccessControl($target.Path, $access) } else { [IO.File]::GetAccessControl($target.Path, $access) }
        $restore.SetSecurityDescriptorSddlForm($target.Before, $access)
        Set-SentinelaAccessDescriptor -Path $target.Path -Descriptor $restore -Directory $target.Directory
      } catch { $rollbackFailed = $true }
    }
    if ($rollbackFailed) { throw 'Local DACL update failed; rollback incomplete. Account contents were not changed. Review permissions before retrying.' }
    throw 'Local DACL update failed; previous DACLs restored. Account contents were not changed.'
  }
}

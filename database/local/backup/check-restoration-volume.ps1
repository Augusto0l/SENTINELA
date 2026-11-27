[CmdletBinding()]
param(
    [ValidatePattern('^[E-Z]$')]
    [string] $VolumeLetter = 'R'
)

$ErrorActionPreference = 'Stop'

$drive = $VolumeLetter.ToUpperInvariant() + ':'
$workspace = "$drive\SENTINELA-RESTORE"
$checks = [ordered]@{}

$paging = fsutil.exe behavior query encryptpagingfile 2>&1 | Out-String
$checks['pagingEncryptionEnabled'] = $LASTEXITCODE -eq 0 -and $paging -match '(?m)^\s*EncryptPagingFile\s*=\s*1\b'
$power = 'HKLM:\SYSTEM\CurrentControlSet\Control\Power'
$fastStartup = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power'
$checks['hibernationAndFastStartupDisabled'] = (Get-ItemProperty $power).HibernateEnabled -eq 0 -and
    (Get-ItemProperty $fastStartup).HiberbootEnabled -eq 0

$crash = 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl'
$checks['systemCrashDumpsDisabled'] = (Get-ItemProperty $crash).CrashDumpEnabled -eq 0
$checks['fullLiveKernelDumpsDisabled'] = (Get-ItemProperty "$crash\FullLiveKernelReports" -ErrorAction SilentlyContinue).FullLiveReportsMax -eq 0

$wer = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting'
$werPolicy = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting'
$werDisabled = (Get-ItemProperty $werPolicy -ErrorAction SilentlyContinue).Disabled
if ($null -eq $werDisabled) { $werDisabled = (Get-ItemProperty $wer -ErrorAction SilentlyContinue).Disabled }
$checks['werDisabledWithoutLocalDumpOverrides'] = $werDisabled -eq 1 -and
    -not (Test-Path "$wer\LocalDumps") -and
    -not (Test-Path 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\Windows Error Reporting\LocalDumps')

$checks['veracryptDeviceMounted'] = $false
$checks['dedicatedNtfsVolume'] = $false
$checks['workspaceAclRestricted'] = $false
if ([IO.Directory]::Exists($drive + '\')) {
    if (-not ('SentinelaRestorationVolume' -as [type])) {
        Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System.Text;
public static class SentinelaRestorationVolume {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint QueryDosDevice(string name, StringBuilder target, int capacity);
}
'@
    }
    $device = New-Object System.Text.StringBuilder 1024
    $result = [SentinelaRestorationVolume]::QueryDosDevice($drive, $device, $device.Capacity)
    $checks['veracryptDeviceMounted'] = $result -gt 0 -and $device.ToString() -match ('^\\Device\\VeraCryptVolume' + $VolumeLetter + '(?:\x00|$)')
    $volume = [IO.DriveInfo]::new($drive)
    $checks['dedicatedNtfsVolume'] = $volume.IsReady -and $volume.DriveFormat -eq 'NTFS' -and $volume.VolumeLabel -eq 'SENTINELA-RESTORE'
    if ([IO.Directory]::Exists($workspace)) {
        $dir = Get-Item -LiteralPath $workspace -Force
        $acl = Get-Acl -LiteralPath $workspace
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
        $unexpected = @($rules | Where-Object { $_.IdentityReference.Value -notin @($sid, 'S-1-5-18', 'S-1-5-32-544') })
        $checks['workspaceAclRestricted'] = -not ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
            $acl.AreAccessRulesProtected -and $rules.Count -gt 0 -and $unexpected.Count -eq 0
    }
}

$failed = @($checks.Keys | Where-Object { -not $checks[$_] })
[pscustomobject]@{ volume = $drive; checks = $checks; failed = $failed } | ConvertTo-Json -Depth 4
if ($failed.Count -ne 0) { exit 2 }

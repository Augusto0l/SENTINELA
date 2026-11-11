const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const quote = value => "'" + value.replace(/'/g, "''") + "'";

// Never include raw process output, command text or paths in diagnostics.
function runPowerShell(body, stage) {
  const script = `$ErrorActionPreference='Stop'; try { ${body} } catch {
    $e=$_.Exception; while($e.InnerException){$e=$e.InnerException}
    $native=$null; if($e -is [ComponentModel.Win32Exception]){$native=$e.NativeErrorCode}
    @{ok=$false;exceptionType=$e.GetType().FullName;hresult=('0x{0:X8}' -f $e.HResult);nativeCode=$native;message='Windows file operation failed; raw message withheld.'}|ConvertTo-Json -Compress; exit 1
  }`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  let payload;
  try { payload = JSON.parse(result.stdout.trim()); } catch { /* Unstructured output is not safe to log. */ }
  if (result.status !== 0 || !payload || payload.ok === false) {
    const diagnostic = {
      stage, exceptionType: payload?.exceptionType ?? 'PowerShellProcessError',
      hresult: payload?.hresult ?? null, nativeCode: payload?.nativeCode ?? null,
      processCode: result.status, processErrorCode: result.error?.code ?? null,
      signal: result.signal, stderrPresent: Boolean(result.stderr?.trim()),
      message: payload?.message ?? 'PowerShell failed; unstructured output withheld.',
    };
    const error = new Error(JSON.stringify(diagnostic));
    error.diagnostic = diagnostic;
    throw error;
  }
  return payload;
}
function metadata(file) {
  return runPowerShell(`$p=${quote(file)}; $s=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group;
    $a=[IO.File]::GetAccessControl($p,$s); $i=Get-Item -LiteralPath $p;
    @{ok=$true;sddl=$a.GetSecurityDescriptorSddlForm($s);creationTicks=$i.CreationTimeUtc.Ticks.ToString();attributes=[int]$i.Attributes}|ConvertTo-Json -Compress`, 'metadata');
}
function replace(source, target) {
  return runPowerShell(`[IO.File]::Replace(${quote(source)},${quote(target)},[System.Management.Automation.Language.NullString]::Value);
    @{ok=$true}|ConvertTo-Json -Compress`, 'replacement');
}
function sameMetadata(a, b) {
  return a.sddl === b.sddl && a.creationTicks === b.creationTicks && a.attributes === b.attributes;
}
function state(file) {
  return { hash: hash(fs.readFileSync(file)), metadata: metadata(file) };
}
function safeError(error, stage) {
  return error.diagnostic ?? { stage, exceptionType: error.name ?? 'Error',
    code: /^[A-Z_0-9]+$/.test(error.code ?? '') ? error.code : null,
    message: 'Controlled operation failed; raw message withheld.' };
}

// Caller supplies an immutable external backup and expected hashes from its reviewed manifest.
// No CLI is exposed: importing this file never installs configuration.
function controlledReplace({ target, backup, candidate, originalHash, candidateHash, validate, fault }) {
  let temporary, attempted = false, initial, stage = 'preparation';
  const temporaryFiles = [];
  const evidence = { recovery: 'NOT_ATTEMPTED', temporaryFiles, diagnostics: [] };
  const checkBackup = () => {
    if (hash(fs.readFileSync(backup)) !== originalHash) throw new Error('Backup mismatch');
  };
  const temp = bytes => {
    const name = path.join(path.dirname(target), '.sentinela-hba-' + crypto.randomUUID() + '.tmp');
    const fd = fs.openSync(name, 'wx', 0o600);
    temporaryFiles.push(name);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return name;
  };
  try {
    for (const file of [target, backup]) if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('Non-regular file');
    if (path.resolve(target) === path.resolve(backup)) throw new Error('Backup must be separate');
    checkBackup();
    if (hash(candidate) !== candidateHash) throw new Error('Candidate mismatch');
    initial = state(target);
    if (initial.hash !== originalHash) throw new Error('Target drift');
    temporary = temp(candidate);
    fault?.('before-replacement', { target, temporary });
    if (JSON.stringify(state(target)) !== JSON.stringify(initial)) throw new Error('Concurrent change');
    stage = 'replacement'; attempted = true;
    fault?.('during-replacement', { target, temporary });
    replace(temporary, target);
    fault?.('after-replacement', { target, temporary });
    stage = 'validation';
    const installed = state(target);
    if (installed.hash !== candidateHash || !sameMetadata(initial.metadata, installed.metadata)) throw new Error('Installed state mismatch');
    validate?.();
    evidence.recovery = 'NOT_NEEDED';
    return evidence;
  } catch (error) {
    evidence.diagnostics.push(safeError(error, stage));
    // Inspect actual state even if Replace threw or preparation failed.
    try {
      checkBackup();
      const live = state(target);
      evidence.targetHash = live.hash;
      if (!initial) evidence.recovery = 'STOPPED_BEFORE_TARGET_SNAPSHOT';
      else if (live.hash === originalHash && sameMetadata(initial.metadata, live.metadata)) evidence.recovery = 'ORIGINAL_CONFIRMED';
      else if (attempted && live.hash === candidateHash && sameMetadata(initial.metadata, live.metadata)) {
        stage = 'recovery';
        // Preserve a copy of the candidate as evidence; Replace normally consumes its source.
        temp(fs.readFileSync(target));
        const recovery = temp(fs.readFileSync(backup));
        checkBackup();
        const latest = state(target);
        if (JSON.stringify(latest) !== JSON.stringify(live)) throw new Error('Concurrent recovery change');
        replace(recovery, target);
        const restored = state(target);
        if (restored.hash !== originalHash || !sameMetadata(initial.metadata, restored.metadata)) throw new Error('Recovery mismatch');
        evidence.recovery = 'ORIGINAL_RESTORED_AND_VERIFIED';
      } else evidence.recovery = 'AMBIGUOUS_OR_CONCURRENT_MANUAL_REVIEW_REQUIRED';
    } catch (recoveryError) {
      evidence.recovery = 'RECOVERY_NOT_CONFIRMED_MANUAL_REVIEW_REQUIRED';
      evidence.diagnostics.push(safeError(recoveryError, 'recovery'));
    }
    const failure = new Error(JSON.stringify({ diagnostics: evidence.diagnostics, recovery: evidence.recovery, targetHash: evidence.targetHash }));
    failure.evidence = evidence;
    throw failure;
  }
}
module.exports = { controlledReplace, metadata, sameMetadata, replace, runPowerShell, hash };

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { controlledReplace, metadata, sameMetadata, runPowerShell, hash } = require('../tools/atomic_replace.cjs');
// Evidence intentionally retained on both success and failure, never under PostgreSQL.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinela-atomic-test-'));
let counter = 0;
function fixture() {
  const dir = path.join(root, String(++counter)); fs.mkdirSync(dir);
  const target = path.join(dir, 'disposable.conf'), backup = path.join(dir, 'original.conf');
  fs.writeFileSync(target, 'synthetic-original\r\n');
  fs.copyFileSync(target, backup);
  const candidate = Buffer.from('synthetic-candidate\r\n');
  return { target, backup, candidate, originalHash: hash(fs.readFileSync(backup)), candidateHash: hash(candidate) };
}
function failure(options) {
  try { controlledReplace(options); assert.fail('Expected failure'); }
  catch (e) { assert.ok(e.evidence); return e.evidence; }
}
function original(f) { assert.equal(hash(fs.readFileSync(f.target)), f.originalHash); }

test('PowerShell 5.1: CLR null and successful atomic replacement preserve ACL, owner, creation and attributes', () => {
  const p = runPowerShell("@{ok=$true;version=$PSVersionTable.PSVersion.Major;nullConverted=([string]::Compare($null,'') -eq 0);realNull=([string]::Compare([System.Management.Automation.Language.NullString]::Value,'') -eq -1)}|ConvertTo-Json -Compress", 'probe');
  assert.equal(p.version, 5); assert.equal(p.nullConverted, true); assert.equal(p.realNull, true);
  const f = fixture();
  const targetLiteral="'"+f.target.replace(/'/g,"''")+"'";
  runPowerShell(`$p=${targetLiteral}; $a=[IO.File]::GetAccessControl($p,[Security.AccessControl.AccessControlSections]::Access); $a.SetAccessRuleProtection($true,$true); [IO.File]::SetAccessControl($p,$a); @{ok=$true}|ConvertTo-Json -Compress`,'test-fixture');
  const before = metadata(f.target);
  assert.equal(controlledReplace(f).recovery, 'NOT_NEEDED');
  assert.equal(hash(fs.readFileSync(f.target)), f.candidateHash);
  assert.ok(sameMetadata(before, metadata(f.target)));
  assert.equal(hash(fs.readFileSync(f.backup)), f.originalHash);
});
test('historical $null call rejected with structured ArgumentException and unchanged disposable target', () => {
  const f = fixture(), source = path.join(path.dirname(f.target), 'source.conf'); fs.writeFileSync(source, f.candidate);
  const q = s => "'" + s.replace(/'/g, "''") + "'";
  assert.throws(() => runPowerShell(`[IO.File]::Replace(${q(source)},${q(f.target)},$null); @{ok=$true}|ConvertTo-Json -Compress`, 'replacement'), e => {
    assert.equal(e.diagnostic.exceptionType, 'System.ArgumentException');
    assert.equal(e.diagnostic.hresult, '0x80070057');
    assert.equal(e.diagnostic.stage, 'replacement');
    assert.equal(e.message.includes(root), false);
    return true;
  }); original(f); assert.ok(fs.existsSync(source));
});
test('failure before replacement retains temporary and original', () => {
  const f = fixture(), e = failure({ ...f, fault(stage) { if (stage === 'before-replacement') throw Error('SECRET_SENTINEL'); } });
  assert.equal(e.recovery, 'ORIGINAL_CONFIRMED'); original(f);
  assert.ok(e.temporaryFiles.some(p => fs.existsSync(p)));
  assert.ok(!JSON.stringify(e.diagnostics).includes('SECRET_SENTINEL'));
});
test('failure at replacement boundary inspects original independently', () => {
  const f = fixture(), e = failure({ ...f, fault(stage) { if (stage === 'during-replacement') throw Error('synthetic'); } });
  assert.equal(e.recovery, 'ORIGINAL_CONFIRMED'); original(f);
});
test('failure after replacement restores content and metadata', () => {
  const f = fixture(), before = metadata(f.target);
  const e = failure({ ...f, fault(stage) { if (stage === 'after-replacement') throw Error('synthetic'); } });
  assert.equal(e.recovery, 'ORIGINAL_RESTORED_AND_VERIFIED'); original(f);
  assert.ok(sameMetadata(before, metadata(f.target)));
  assert.ok(e.temporaryFiles.some(p => fs.existsSync(p) && hash(fs.readFileSync(p)) === f.candidateHash));
});
test('validation failure recovers original', () => {
  const f = fixture(), e = failure({ ...f, validate() { throw Error('synthetic validation'); } });
  assert.equal(e.recovery, 'ORIGINAL_RESTORED_AND_VERIFIED'); original(f);
  assert.equal(e.diagnostics[0].stage, 'validation');
});
test('concurrent change before replacement is never overwritten', () => {
  const f = fixture(), e = failure({ ...f, fault(stage) { if (stage === 'before-replacement') fs.writeFileSync(f.target, 'concurrent'); } });
  assert.equal(e.recovery, 'AMBIGUOUS_OR_CONCURRENT_MANUAL_REVIEW_REQUIRED');
  assert.equal(fs.readFileSync(f.target, 'utf8'), 'concurrent');
});
test('partial/unknown content during replacement stops with evidence', () => {
  const f = fixture(), e = failure({ ...f, fault(stage) { if (stage === 'during-replacement') { fs.writeFileSync(f.target, 'partial'); throw Error('synthetic'); } } });
  assert.equal(e.recovery, 'AMBIGUOUS_OR_CONCURRENT_MANUAL_REVIEW_REQUIRED');
  assert.equal(fs.readFileSync(f.target, 'utf8'), 'partial');
  assert.ok(e.temporaryFiles.some(p => fs.existsSync(p)));
});
test('concurrent change after replacement is never overwritten', () => {
  const f = fixture(), e = failure({ ...f, fault(stage) { if (stage === 'after-replacement') fs.writeFileSync(f.target, 'concurrent'); } });
  assert.equal(e.recovery, 'AMBIGUOUS_OR_CONCURRENT_MANUAL_REVIEW_REQUIRED');
  assert.equal(fs.readFileSync(f.target, 'utf8'), 'concurrent');
});
test('corrupt backup prohibits recovery', () => {
  const f = fixture(), e = failure({ ...f, fault(stage) { if (stage === 'after-replacement') { fs.writeFileSync(f.backup, 'corrupt'); throw Error('synthetic'); } } });
  assert.equal(e.recovery, 'RECOVERY_NOT_CONFIRMED_MANUAL_REVIEW_REQUIRED');
  assert.equal(hash(fs.readFileSync(f.target)), f.candidateHash);
});
console.log('Disposable evidence directory: ' + root);

test('native replacement failure retains structured file-not-found diagnostics', () => {
  const f = fixture(), e = failure({ ...f, fault(stage, context) {
    if (stage === 'during-replacement') fs.renameSync(context.temporary, context.temporary + '.retained');
  } });
  assert.equal(e.recovery, 'ORIGINAL_CONFIRMED'); original(f);
  assert.equal(e.diagnostics[0].stage, 'replacement');
  assert.equal(e.diagnostics[0].exceptionType, 'System.IO.FileNotFoundException');
  assert.equal(e.diagnostics[0].hresult, '0x80070002');
});
test('metadata drift stops automatic recovery even with candidate content', () => {
  const f = fixture(), e = failure({ ...f, fault(stage) {
    if (stage === 'after-replacement') {
      const q="'"+f.target.replace(/'/g,"''")+"'";
      runPowerShell(`$p=${q}; [IO.File]::SetCreationTimeUtc($p,[datetime]'2020-01-01T00:00:00Z'); @{ok=$true}|ConvertTo-Json -Compress`, 'test-fixture');
    }
  } });
  assert.equal(e.recovery, 'AMBIGUOUS_OR_CONCURRENT_MANUAL_REVIEW_REQUIRED');
  assert.equal(hash(fs.readFileSync(f.target)), f.candidateHash);
});

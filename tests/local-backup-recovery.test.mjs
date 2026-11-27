import test from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
test("local recovery: offline authorization, archive, failures, ACLs and real private Windows pipe",async()=>{
 const {stdout,stderr}=await promisify(execFile)("python",["-B","-m","unittest","discover","-s","database/local/backup","-p","test_*.py"],{windowsHide:true,timeout:30000})
 assert.match(stdout+stderr,/Ran 14 tests/);assert.match(stdout+stderr,/\bOK\b/)
})

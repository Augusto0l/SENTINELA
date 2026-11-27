import { mkdir,writeFile } from "node:fs/promises"
import { randomUUID,createHash } from "node:crypto"
import { comparePreoperational } from "../database/local/write-sandbox/compare-preoperational.mjs"
import { readVerifiedEvidence } from "./ra-evidence.mjs"
const args=process.argv.slice(2)
if(args.length!==4||args[2]!=="--sandbox-sha256"){
 console.error("Usage: node scripts/compare-ra-preoperational.mjs <audit.json> <sandbox-baseline.json> --sandbox-sha256 <approved-sha256>")
 process.exitCode=1
}else{
 const directory=`tmp/ra-preoperational-comparison-${randomUUID()}`
 let report
 try{
  const [a,b]=await Promise.all([readVerifiedEvidence(args[0],"operational"),readVerifiedEvidence(args[1],"sandbox",args[3])])
  const structural=comparePreoperational(a.data,b.data)
  const ledger=a.data.checks.find(c=>c.name==="ledger")
  report={...structural,createdAt:new Date().toISOString(),scope:"baseline-structure-only",sources:{operational:{path:a.path,sha256:a.sha256,integrity:a.integrity},sandbox:{path:b.path,sha256:b.sha256,integrity:b.integrity}},
   readiness:"BLOCKED",gates:{ledger:ledger??{status:"NOT VERIFIED"},catalogTotal:a.data.catalogTotal??{status:"NOT VERIFIED"},backup:{status:"BLOCKED",reason:"No verified current local backup supplied"},restore:{status:"NOT VERIFIED"},operationalAuthorization:{status:"BLOCKED"}}}
 }catch(e){report={result:"NOT VERIFIED",createdAt:new Date().toISOString(),scope:"baseline-structure-only",reason:e.code??"EVIDENCE_QUALIFICATION_FAILED",comparisons:[],readiness:"BLOCKED"}}
 await mkdir(directory,{recursive:true})
 const bytes=JSON.stringify(report,null,2)
 await writeFile(`${directory}/comparison.json`,bytes,{flag:"wx"})
 await writeFile(`${directory}/sha256.txt`,createHash("sha256").update(bytes).digest("hex"),{flag:"wx"})
 console.log(JSON.stringify({result:report.result,readiness:report.readiness,reason:report.reason,directory,comparisons:report.comparisons}))
 if(report.result!=="PASS")process.exitCode=1
}

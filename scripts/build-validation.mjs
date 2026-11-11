// Keep production validation output separate from an existing development server.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
const root=fileURLToPath(new URL("../",import.meta.url))
mkdirSync(new URL("../tmp/",import.meta.url),{recursive:true})
const envFile=new URL("../next-env.d.ts",import.meta.url)
const original=existsSync(envFile)?readFileSync(envFile):null
writeFileSync(new URL("../tmp/next-env-build.d.ts",import.meta.url),'/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n')
writeFileSync(new URL("../tmp/tsconfig-build-validation.json",import.meta.url),JSON.stringify({extends:"../tsconfig.json",compilerOptions:{incremental:false},include:["../src/**/*.ts","../src/**/*.tsx","./next-env-build.d.ts","../.next-build-validation/types/**/*.ts"]},null,2))
const child=spawn(process.execPath,["scripts/next-cli.mjs","build"],{cwd:root,env:{...process.env,SENTINELA_VALIDATE_BUILD:"1"},stdio:"inherit"})
child.on("error",()=>{process.exitCode=1})
child.on("exit",code=>{
  if(original && existsSync(envFile) && readFileSync(envFile,"utf8").includes(".next-build-validation/"))writeFileSync(envFile,original)
  process.exitCode=code??1
})

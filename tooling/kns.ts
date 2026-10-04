#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  generatePublisherKey,
  loadSqlParser,
  packModule,
  validatePackage,
} from '@kns/module-toolchain';

const args=process.argv.slice(2);
const flag=(name:string)=>{const i=args.indexOf(`--${name}`);return i>=0?args[i+1]:undefined};
const command=args[0];

const fail=(message:string):never=>{throw new Error(message)};
await loadSqlParser();

if(command==='keygen'){
  const keyId=args[1], out=args[2];
  if(!keyId||!out||!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(keyId))
    fail('Usage: kns keygen <key-id> <output-dir>');
  await mkdir(out,{recursive:true});
  const key=generatePublisherKey();
  const file=join(out,`${keyId}.private.pem`);
  await writeFile(file,key.privateKeyPem,{flag:'wx',mode:0o600});
  await chmod(file,0o600);
  console.log(`Private key written to ${file} (keep it secret; never commit or package it).`);
  console.log('Public trust entry (KNS operator must explicitly approve trust and module scope):');
  console.log(JSON.stringify({keyId,publicKey:key.publicKey,modules:['<module-id>'],revoked:false},null,2));
}else if(command==='pack'){
  const input=args[1], keyPath=flag('key'), keyId=flag('key-id');
  if(!input||!keyPath||!keyId)
    fail('Usage: kns pack <release-dir> --key <private.pem> --key-id <id> [--out <dir>]');
  const result=await packModule({
    input,outputDir:flag('out')??'.',
    privateKeyPem:await readFile(keyPath,'utf8'),privateKeyPath:keyPath,keyId
  });
  console.log(`${basename(result.file)}\nSHA-256 ${result.sha256}\n${result.report.status}`);
}else if(command==='verify'){
  const file=args[1], trustPath=flag('trust');
  if(!file||!trustPath)
    fail('Usage: kns verify <file.knsmod> --trust <trust-store.json> [--json]');
  if(flag('platform')) fail('Public verify is offline package verification only; platform context is operator-owned.');
  const report=validatePackage(await readFile(file),{
    trustStore:JSON.parse(await readFile(trustPath,'utf8')),filename:basename(file)
  });
  if(args.includes('--json')) console.log(JSON.stringify(report,null,2));
  else{
    console.log(`${report.status}  ${report.moduleId??'?'}@${report.moduleVersion??'?'}  sha256 ${report.packageSha256}`);
    for(const stage of report.stages){
      console.log(`  ${stage.status.padEnd(13)} ${stage.label}`);
      for(const finding of stage.findings) console.log(`      - ${finding}`);
    }
  }
  process.exitCode=report.status==='PACKAGE_VERIFIED'?0:2;
}else{
  fail('Usage: kns keygen | pack | verify');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeHtml } from '../tools/ad-images/scripts/render.mjs';

const template='<html><body><img src="{{IMAGE_SRC}}"></body></html>';
test('supplied photos are embedded for isolated browser capture',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-photo-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'photo.png');
  const bytes=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154081d63f8cfc0f01f000580023f49c2dbb40000000049454e44ae426082','hex');
  fs.writeFileSync(file,bytes);
  const html=makeHtml(template,{image:file},1080,1080);
  assert.ok(html.includes('data:image/png;base64,'+bytes.toString('base64')));
  assert.ok(!html.includes(dir));
});
test('invalid or oversized supplied image is rejected before rendering',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-photo-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'photo.png');
  fs.writeFileSync(file,'<html>not an image</html>');
  assert.throws(()=>makeHtml(template,{image:file},1080,1080),/bytes do not match/);
  fs.writeFileSync(file,Buffer.alloc(16*1024*1024+1));
  assert.throws(()=>makeHtml(template,{image:file},1080,1080),/exceeds 16 MiB/);
});

test('installed Ad Images resolves capture driver through its studio marker',t=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-installed-photo-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const skill=path.join(dir,'skills','ad-images');
  fs.cpSync(path.join(root,'tools/ad-images'),skill,{recursive:true});
  fs.writeFileSync(path.join(skill,'studio-root'),root+'\n');
  const env={...process.env};delete env.CONTENT_STUDIO_DIR;
  const result=spawnSync(process.execPath,['--input-type=module','-e','await import(process.argv[1])',pathToFileURL(path.join(skill,'scripts/render.mjs')).href],{env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('failed paint check rejects the creative and preserves the previous contact sheet',t=>{
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-paint-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'VERSION'),'fixture');fs.writeFileSync(path.join(root,'DIRECTOR.md'),'fixture');
  fs.cpSync(path.join(source,'tools/ad-images'),path.join(root,'tools/ad-images'),{recursive:true});
  fs.mkdirSync(path.join(root,'tools/carousel-builder/lib'),{recursive:true});
  fs.writeFileSync(path.join(root,'tools/carousel-builder/lib/render.js'),`const fs=require('node:fs');module.exports.chromeScreenshot=async({out})=>{fs.writeFileSync(out,Buffer.alloc(2000));return{cornerCheck:{ok:false}};};`);
  fs.mkdirSync(path.join(root,'scripts'));fs.copyFileSync(path.join(source,'scripts/studio.mjs'),path.join(root,'scripts/studio.mjs'));fs.copyFileSync(path.join(source,'scripts/studio-root.cjs'),path.join(root,'scripts/studio-root.cjs'));
  const env={...process.env,CONTENT_STUDIO_DIR:root};
  const out=path.join(root,'creative.png');
  const options={templatePath:path.join(root,'tools/ad-images/templates/offer-card.html'),data:{hook:'Sample',body:'Sample',cta:'View'},outPath:out,width:1080,height:1080,browser:'fixture'};
  const result=spawnSync(process.execPath,['--input-type=module','-e','const {render}=await import(process.argv[1]);await render(JSON.parse(process.argv[2]));',pathToFileURL(path.join(root,'tools/ad-images/scripts/render.mjs')).href,JSON.stringify(options)],{env,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/paint check/);assert.equal(fs.existsSync(out),false);
  const run=path.join(root,'run');fs.mkdirSync(run);fs.writeFileSync(path.join(run,'image.png'),'fixture');
  const sheet=path.join(run,'contact-sheet.png');fs.writeFileSync(sheet,'previous valid sheet');
  const contact=spawnSync(process.execPath,[path.join(root,'scripts/studio.mjs'),'contact-sheet',run],{env,encoding:'utf8'});
  assert.notEqual(contact.status,0);assert.match(contact.stderr,/paint check/);assert.equal(fs.readFileSync(sheet,'utf8'),'previous valid sheet');
});

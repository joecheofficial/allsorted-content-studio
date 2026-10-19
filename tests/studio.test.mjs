import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
// The installers schedule a weekly self-update job; tests must never register one on this machine.
process.env.CONTENT_STUDIO_SKIP_UPDATES='1'
// The installers also set up HyperFrames (network, shell profile); tests never do.
process.env.CONTENT_STUDIO_SKIP_HYPERFRAMES='1'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const node='/opt/homebrew/bin/node';
// A fresh clone has no brand/brand.json (it is the owner's file and gitignored). The
// root-studio tests expect the example brand, so seed it and remove it afterwards.
const seededBrand=[];
test.before(()=>{for(const file of ['brand/BRAND-BRAIN.md','brand/brand.json']){if(!fs.existsSync(path.join(root,file)))seededBrand.push(file)}
  if(seededBrand.length){const made=spawnSync(node,['scripts/studio.mjs','use-example-brand'],{cwd:root,encoding:'utf8',env:{...process.env}});if(made.status!==0)throw new Error(made.stderr||made.stdout)}});
test.after(()=>{for(const file of seededBrand)fs.rmSync(path.join(root,file),{force:true})});
const require=createRequire(import.meta.url);
function exec(args,env={}){return spawnSync(node,args,{cwd:root,encoding:'utf8',env:{...process.env,CONTENT_STUDIO_DIR:root,...env}})}
function makeBrandStudio(){const dir=path.join(root,'.test-data/brand-studio');fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(path.join(dir,'brand'),{recursive:true});fs.symlinkSync(path.join(root,'tools'),path.join(dir,'tools'),'dir');for(const file of ['BRAND-BRAIN.example.md','BRAND-BRAIN.template.md','brand.example.json'])fs.copyFileSync(path.join(root,'brand',file),path.join(dir,'brand',file));return dir;}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.name!=='.git'&&e.name!=='node_modules').flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p]})}
function snapshot(dir){if(!fs.existsSync(dir))return {};return Object.fromEntries(walk(dir).map(file=>[path.relative(dir,file),`${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}:${fs.statSync(file).mtimeMs}`]));}
const pwsh=spawnSync('which',['pwsh'],{encoding:'utf8'}).status===0?'pwsh':spawnSync('which',['pwsh-preview'],{encoding:'utf8'}).status===0?'pwsh-preview':null;
function runPwsh(args,env={}){return spawnSync(pwsh,['-NoProfile','-File','install.ps1',...args],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,...env}})}
function contentTree(dir){return Object.fromEntries(walk(dir).filter(file=>!/(^|[\\/])_selftest[\\/]images[\\/]|\.(png|jpe?g|webp)$/i.test(path.relative(dir,file))).map(file=>{let rel=path.relative(dir,file),content=fs.readFileSync(file);if(/\.md$/.test(rel))content=Buffer.from(content.toString('utf8').replaceAll(dir,'<INSTALL_DIR>'));if(path.basename(rel)==='studio-root')content=Buffer.from('<INSTALL_DIR>\n');return [rel,createHash('sha256').update(content).digest('hex')]}))}
test('no-argument usage lists every studio subcommand and brief generation fills known fields',()=>{
  const usage=exec(['scripts/studio.mjs']);assert.equal(usage.status,0,usage.stderr);for(const command of ['self-test','render-test','brand-json','use-example-brand','new-run','brief','contact-sheet','check','handoff'])assert.match(usage.stdout,new RegExp(`\\b${command}\\b`));
  const run=path.join(root,'.test-data/brief-contract');fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'request.md'),'Create two square images for the beginner class.');
  const result=exec(['scripts/studio.mjs','brief',run]);assert.equal(result.status,0,result.stderr||result.stdout);const brief=fs.readFileSync(path.join(run,'brief.md'),'utf8');assert.match(brief,/Create two square images/);assert.match(brief,/Beginner yoga classes/);assert.match(brief,/^## Audience\n\S+/m);assert.match(brief,/^## Format and count\n2 square images/m);assert.doesNotMatch(brief,/^- Format and count$/m);fs.rmSync(run,{recursive:true,force:true});
});

test('installed --dir shipped Markdown explains the studio root without unresolved placeholders',()=>{
  const home=path.join(root,'.test-data/md-install-home'),dest=path.join(home,'studio copy');fs.rmSync(home,{recursive:true,force:true});
  try {
    const install=spawnSync('sh',['install.sh','--home',home,'--dir',dest,'--no-npm'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`}});
    assert.equal(install.status,0,install.stderr||install.stdout);
    const markdown=walk(dest).filter(file=>file.endsWith('.md'));
    assert.ok(markdown.length>0);
    for(const file of markdown){const text=fs.readFileSync(file,'utf8'),rel=path.relative(dest,file);assert.doesNotMatch(text,/<path>/i,`${rel} has no unresolved path placeholder`);assert.doesNotMatch(text,/(?:set|resolve)\s+`?CONTENT_STUDIO_DIR`?\s+(?:to|as)\s+(?:this folder|this directory|the directory containing)/i,`${rel} has no instruction requiring an unresolved root variable`);}
    for(const name of ['AGENTS.md','DIRECTOR.md','README.md'])assert.match(fs.readFileSync(path.join(dest,name),'utf8'),/studio root is the folder that contains this file/i,name);
  } finally {fs.rmSync(home,{recursive:true,force:true});}
});

test('brief parses documented image ratios and carousel slide counts, and check reports missing requested creatives',()=>{
  const run=path.join(root,'.test-data/requested-counts');fs.rmSync(run,{recursive:true,force:true});fs.mkdirSync(path.join(run,'images'),{recursive:true});fs.mkdirSync(path.join(run,'carousel'),{recursive:true});
  fs.writeFileSync(path.join(run,'request.md'),'Create two square images, one story image, and a three-slide carousel.');
  const made=exec(['scripts/studio.mjs','brief',run]);assert.equal(made.status,0,made.stderr||made.stdout);const brief=fs.readFileSync(path.join(run,'brief.md'),'utf8');assert.match(brief,/^## Format and count\n2 square images, 1 story image, 3-slide carousel$/m);assert.doesNotMatch(brief,/^- Format and count$/m);
  fs.writeFileSync(path.join(run,'images/manifest.json'),JSON.stringify({files:[{file:'one_01_offer-card_square.png',ratio:'square',width:1080,height:1080,status:'rendered'}]}));
  fs.writeFileSync(path.join(run,'carousel/manifest.json'),JSON.stringify({files:[{file:'deck_01_carousel_square.png'},{file:'deck_02_carousel_square.png'}]}));fs.writeFileSync(path.join(run,'run-log.jsonl'),'');
  const checked=exec(['scripts/studio.mjs','check',run]);assert.notEqual(checked.status,0);assert.match(checked.stderr,/Requested image \(story\) 1 of 1 is missing/);assert.match(checked.stderr,/Requested carousel slide 3 of 3 is missing/);assert.match(checked.stderr,/Requested image \(square\) 2 of 2 is missing/);
  fs.rmSync(run,{recursive:true,force:true});
});

test('brief uses documented batch and carousel inputs when request prose omits format counts',()=>{
  const run=path.join(root,'.test-data/documented-format-inputs');fs.rmSync(run,{recursive:true,force:true});fs.mkdirSync(path.join(run,'images'),{recursive:true});
  fs.writeFileSync(path.join(run,'request.md'),'Create a welcoming campaign.');fs.writeFileSync(path.join(run,'images/batch.json'),JSON.stringify({format:'single',ratio:'story',variations:[{hook:'First'},{hook:'Second'}]}));fs.writeFileSync(path.join(run,'carousel-data.json'),JSON.stringify({title:'sample',preset:'square',slides:[{headline:'One'},{headline:'Two'},{headline:'Three'}]}));
  const made=exec(['scripts/studio.mjs','brief',run]);assert.equal(made.status,0,made.stderr||made.stdout);const brief=fs.readFileSync(path.join(run,'brief.md'),'utf8');assert.match(brief,/^## Format and count\n2 story images, 3-slide carousel$/m);assert.doesNotMatch(brief,/^- Format and count$/m);fs.rmSync(run,{recursive:true,force:true});
});
test('all nine agents inherit the host model and include no model pin',()=>{const files=fs.readdirSync(path.join(root,'agents')).filter(f=>f.endsWith('.md'));assert.equal(files.length,9);for(const f of files){const text=fs.readFileSync(path.join(root,'agents',f),'utf8');assert.match(text,/^model: inherit$/m,f);for(const token of ['fa'+'ble','op'+'us','son'+'net','hai'+'ku','g'+'pt'])assert.doesNotMatch(text,new RegExp(token,'i'),f)}});
test('the six packaged tools include pinned carousel engine and Video Editor modules',()=>{for(const [name,file] of [['HookLab','tools/hooklab/SKILL.md'],['Ad Images','tools/ad-images/scripts/render.mjs'],['CTA color helper','tools/ad-images/scripts/cta-colors.mjs'],['Carousel Builder','tools/carousel-builder/bin/carousel.js'],['HeyGen Ad Videos','tools/heygen-ad-videos/scripts/heygen.mjs'],['Video Editor','tools/video-editor/index.js'],['Launch Video','tools/launch-video/brag/SKILL.md'],['Launch Video slim','tools/launch-video/brag-slim/SKILL.md'],['Launch Video licence','tools/launch-video/LICENSE']])assert.ok(fs.existsSync(path.join(root,file)),`${name} is packaged`);const pin=fs.readFileSync(path.join(root,'tools/video-editor/PINNED'),'utf8');assert.match(pin,/version: 1\.4\.1/);assert.match(pin,/commit: b8b37d6/);assert.match(pin,/date: 2026-10-19/);for(const file of ['tools/video-editor/hyperframes.js','tools/video-editor/INSTALL-HYPERFRAMES.md','tools/video-editor/HYPERFRAMES-EDIT-PROMPTS.md','tools/video-editor/LONG-TO-SHORT.md','scripts/hyperframes-setup.mjs'])assert.ok(fs.existsSync(path.join(root,file)),`${file} is packaged`);const carouselPin=fs.readFileSync(path.join(root,'tools/carousel-builder/PINNED'),'utf8');assert.match(carouselPin,/v1\.2\.1/);assert.match(carouselPin,/101b696/) });
test('self-test names all six tools and treats missing ffmpeg as optional',()=>{const result=exec(['scripts/studio.mjs','self-test'],{FFMPEG_BIN:'/definitely-not-installed'});assert.equal(result.status,0,result.stderr||result.stdout);for(const name of ['Node: working','Chrome/Edge: working','HookLab: working','Ad Images: working','Carousel Builder: working','HeyGen Ad Videos: working','Video Editor: ffmpeg not installed (optional)','HyperFrames: ','Launch Video: working'])assert.ok(result.stdout.includes(name),`${name} appears in self-test`)});
test('brand source generates the shared JSON consumed by tools',()=>{const studio=makeBrandStudio(),md=`# Brand Brain\n\n- Brand name: Sunrise Yoga Studio\n- Offer: Beginner yoga classes\n- Specific audience: Adults trying yoga\n- Current situation: Curious and cautious\n- Problem in their words: Unsure how to start\n- Desired supported outcome: Learn gentle movements\n- Approved facts and proof: none\n- Testimonials with permission: none\n- Claims to avoid: guaranteed health outcomes\n- Voice: Calm and practical\n- Background color: #FFF8EC\n- Ink color: #25443B\n- Accent color: #E98256\n- Default theme: light\n- Display font: Georgia\n- Body font: Arial\n- Image direction: Morning light\n- CTA wording: See the class schedule\n`;fs.writeFileSync(path.join(studio,'brand/BRAND-BRAIN.md'),md);const result=exec(['scripts/studio.mjs','brand-json'],{CONTENT_STUDIO_DIR:studio});assert.equal(result.status,0,result.stderr||result.stdout);const brand=JSON.parse(fs.readFileSync(path.join(studio,'brand/brand.json'),'utf8'));assert.equal(brand.brandName,'Sunrise Yoga Studio');assert.equal(brand.theme,'light');assert.equal(brand.colors.canvas,'#FFF8EC');assert.equal(brand.colors.accent,'#E98256');assert.equal(brand.cta,'See the class schedule');});

test('use-example-brand creates matching example files and refuses to overwrite them',()=>{
  const studio=makeBrandStudio(),md=path.join(studio,'brand/BRAND-BRAIN.md'),json=path.join(studio,'brand/brand.json');
  fs.rmSync(md,{force:true});fs.rmSync(json,{force:true});
  try {
    const made=exec(['scripts/studio.mjs','use-example-brand'],{CONTENT_STUDIO_DIR:studio});assert.equal(made.status,0,made.stderr||made.stdout);
    const brand=JSON.parse(fs.readFileSync(json,'utf8'));const example=JSON.parse(fs.readFileSync(path.join(studio,'brand/brand.example.json'),'utf8'));
    for(const key of ['brandName','offer','priceOrTerms','destination','audience','problem','supportedOutcome','voice','theme','colors','fonts','imageDirection','primaryAction','cta'])assert.deepEqual(brand[key],example[key],`${key} is consistent`);
    const before=fs.readFileSync(md,'utf8');const refused=exec(['scripts/studio.mjs','use-example-brand'],{CONTENT_STUDIO_DIR:studio});assert.notEqual(refused.status,0);assert.equal(fs.readFileSync(md,'utf8'),before);
  } finally {fs.rmSync(md,{force:true});fs.rmSync(json,{force:true});}
});

test('every shipped SKILL.md has name and description frontmatter and passes the skill-pack deny-list',()=>{
  const deny=/api key|api_key|client secret|credentials required|access token required/i;
  for(const file of walk(root).filter(file=>!file.startsWith(path.join(root,'.test-data'))&&path.basename(file)==='SKILL.md')){
    const text=fs.readFileSync(file,'utf8');
    assert.match(text,/^---\n(?=[\s\S]*?^name:\s*\S+)(?=[\s\S]*?^description:\s*\S+)[\s\S]*?^---\s*$/m,path.relative(root,file));
    assert.doesNotMatch(text,deny,path.relative(root,file));
  }
});
test('in-place install twice preserves every shipped file byte-for-byte and resolves Claude placeholders',()=>{
  const home=path.join(root,'.test-data/in-place-home');fs.rmSync(home,{recursive:true,force:true});fs.mkdirSync(home,{recursive:true});
  const shipped=()=>Object.fromEntries(walk(root).filter(file=>{const rel=path.relative(root,file).split(path.sep).join('/');return !rel.startsWith('.test-data/')&&!rel.startsWith('runs/')&&rel!=='learnings/LEARNINGS.md'&&rel!=='brand/brand.json'&&!rel.split('/').includes('node_modules')}).map(file=>[path.relative(root,file),createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  const before=shipped();
  try{
    for(let i=0;i<2;i++){const result=spawnSync('sh',['install.sh','--home',home,'--dir',root,'--no-npm'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:'/opt/homebrew/bin:'+process.env.PATH}});assert.equal(result.status,0,result.stderr||result.stdout);assert.deepEqual(shipped(),before,'source bytes unchanged by in-place install');}
    const skill=fs.readFileSync(path.join(home,'.claude/skills/content-studio/SKILL.md'),'utf8');assert.ok(skill.includes(root));assert.equal(skill.includes('CONTENT_STUDIO_DIR'),false);
    const agent=fs.readFileSync(path.join(home,'.claude/agents/content-director.md'),'utf8');assert.ok(agent.includes(root));assert.equal(agent.includes('CONTENT_STUDIO_DIR'),false);
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});
test('source files contain no private paths, prohibited identity markers, or em dashes',()=>{for(const f of walk(root)){if(f.startsWith(path.join(root,'.test-data'))||/\.png$|\.jpg$|\.webp$|\.pdf$|\.mp3$|\.mp4$|\.wav$/i.test(f)||f.includes(`${path.sep}node_modules${path.sep}`))continue;const s=fs.readFileSync(f,'utf8');const upstream=f.startsWith(path.join(root,'tools','launch-video')+path.sep);if(!upstream)assert.doesNotMatch(s,/\/(?:Users|home)\//,path.relative(root,f));const blocked=[['my','os'].join(''),['new','york','1'].join(''),['master','minds','hq'].join(''),['jo'+'e','@'].join(''),['illy','@'].join(''),['@','gmail'].join(''),['j'+'oe','ch'+'e'].join(' ')];for(const token of blocked)assert.equal(s.toLowerCase().includes(token.toLowerCase()),false,path.relative(root,f));assert.equal(new RegExp('\\b'+'j'+'oe'+'\\b','i').test(s),false,path.relative(root,f));assert.equal(new RegExp('\\b'+'master'+'mind'+'\\b','i').test(s),false,path.relative(root,f));const blockedPatterns=[new RegExp(['act','_','\\d+'].join(''),'i'),new RegExp(['E','AA','[A-Za-z0-9_-]{8,}'].join(''),'i'),new RegExp(['sk-','[A-Za-z0-9_-]{12,}'].join(''),'i')];for(const pattern of blockedPatterns)assert.equal(pattern.test(s),false,path.relative(root,f));if(!upstream)assert.equal(s.includes(String.fromCharCode(0x2014)),false,path.relative(root,f));const owner=['joseph','tandle'].join('');if(new RegExp(owner,'i').test(s)){assert.equal(new RegExp('https://'+'github.com/'+owner+'/','i').test(s),true,path.relative(root,f));}}});
test('install twice into a spaced path with --no-npm leaves zero changed files or backups', () => {
  const scratch=fs.mkdtempSync(path.join(root,'.test-data/install-space-')),home = path.join(scratch, 'home dir'), dest = path.join(home, 'All Sorted Studio');
  fs.mkdirSync(home, { recursive: true });
  const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  try {
    const pre = path.join(home, '.claude/skills/hooklab/personal');
    fs.mkdirSync(pre, { recursive: true });
    fs.writeFileSync(path.join(pre, 'private-notes.md'), 'preserve this personal file');
    const args = ['install.sh', '--home', home, '--dir', dest, '--no-npm'];
    const first = spawnSync('sh', args, { cwd: root, encoding: 'utf8', env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`} });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    fs.mkdirSync(path.join(dest, 'brand'), { recursive: true });
    fs.mkdirSync(path.join(dest, 'runs', 'keep'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'brand/BRAND-BRAIN.md'), 'keep-brand');
    fs.writeFileSync(path.join(dest, 'brand/brand.json'), '{}');
    fs.writeFileSync(path.join(dest, 'runs/keep/brief.md'), 'keep-run');
    fs.writeFileSync(path.join(dest, 'learnings/LEARNINGS.md'), 'keep-learning');
    const target = path.join(dest, 'README.md');
    assert.match(fs.readFileSync(path.join(dest,'DIRECTOR.md'),'utf8'),/studio root is the folder that contains this file/i,'install-root director gives a file-relative studio-root rule');
    const installedAgent = path.join(home, '.claude/agents/content-director.md');
    const installedSkill = path.join(home, '.claude/skills/content-studio/SKILL.md');
    const preserved = ['brand/BRAND-BRAIN.md', 'brand/brand.json', 'runs/keep/brief.md', 'learnings/LEARNINGS.md'].map((p) => path.join(dest, p));
    const preservedHashes = preserved.map(hash);
    const installedHashes = [target, installedAgent, installedSkill].map(hash);
    assert.equal(fs.readFileSync(installedAgent, 'utf8').includes('CONTENT_STUDIO_DIR'), false);
    assert.ok(fs.existsSync(installedSkill));
    assert.ok(fs.existsSync(path.join(home, '.claude/skills/ad-images/SKILL.md')));
    assert.ok(fs.existsSync(path.join(home, '.claude/skills/heygen-ad-videos/SKILL.md')));
    assert.ok(fs.existsSync(path.join(dest,'learnings/LEARNINGS.md')),'installer creates learnings from the shipped template');
    assert.equal(fs.readFileSync(path.join(pre, 'private-notes.md'), 'utf8'), 'preserve this personal file');
    assert.ok(fs.existsSync(path.join(pre, 'my-brand-voice.md')));
    const checker = fs.readFileSync(path.join(home,'.claude/agents/content-checker.md'),'utf8');
    const checkCommand = checker.split('\n').find(line => line.includes('self-test --no-render'));
    assert.ok(checkCommand,'installed checker contains the self-test command');
    assert.equal(checkCommand.includes('CONTENT_STUDIO_DIR'),false,'installed command has the concrete spaced install path');
    const checkerRun=spawnSync('/bin/sh',['-c',checkCommand],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`,CONTENT_STUDIO_DIR:dest}});
    assert.equal(checkerRun.status,0,checkerRun.stderr||checkerRun.stdout);
    assert.match(checkerRun.stdout,/Carousel Builder: working/);
    const beforeSecond=snapshot(home);
    const backupsBefore=walk(home).filter(file=>file.includes('.backup-')).length;
    const second = spawnSync('sh', args, { cwd: root, encoding: 'utf8', env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`} });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.deepEqual([target, installedAgent, installedSkill].map(hash), installedHashes);
    assert.deepEqual(preserved.map(hash), preservedHashes);
    assert.deepEqual(snapshot(home),beforeSecond,'second install changes no file contents or timestamps');
    assert.equal(walk(home).filter(file=>file.includes('.backup-')).length,backupsBefore,'identical install creates no backups');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
test('customized hooklab skill and content director are backed up before install',()=>{
  const scratch=fs.mkdtempSync(path.join(root,'.test-data/install-custom-')),home=path.join(scratch,'customized home');
  const hook=path.join(home,'.claude/skills/hooklab'),agents=path.join(home,'.claude/agents');fs.mkdirSync(hook,{recursive:true});fs.mkdirSync(agents,{recursive:true});
  const hookFile=path.join(hook,'SKILL.md'),agentFile=path.join(agents,'content-director.md'),hookOriginal='member hooklab customization\n',agentOriginal='member director customization\n';fs.writeFileSync(hookFile,hookOriginal);fs.writeFileSync(agentFile,agentOriginal);
  try{const result=spawnSync('sh',['install.sh','--home',home,'--dir',path.join(home,'Studio'),'--no-npm'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`}});assert.equal(result.status,0,result.stderr||result.stdout);
    const backupLines=result.stdout.split('\n').filter(line=>line.startsWith('Backed up your existing '));assert.equal(backupLines.length,2,result.stdout);
    assert.deepEqual(backupLines.map(line=>line.match(/^Backed up your existing (.+?) to (.+)$/)?.[1]).sort(),['content-director.md','hooklab'].sort());
    for(const [name,original] of [['hooklab',hookOriginal],['content-director.md',agentOriginal]]){const saved=backupLines.map(line=>line.match(/^Backed up your existing .+ to (.+)$/)?.[1]).find(file=>file&&file.includes(`/${name}.backup-`));assert.ok(saved,`backup path for ${name}`);const backupFile=name==='hooklab'?path.join(saved,'SKILL.md'):saved;assert.equal(fs.readFileSync(backupFile,'utf8'),original);}
    const after=snapshot(home);const second=spawnSync('sh',['install.sh','--home',home,'--dir',path.join(home,'Studio'),'--no-npm'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`}});assert.equal(second.status,0,second.stderr||second.stdout);assert.equal(second.stdout.includes('Backed up your existing'),false,second.stdout);assert.deepEqual(snapshot(home),after);
  }finally{fs.rmSync(scratch,{recursive:true,force:true});}
});
test('ALLSORTED_NO_NPM=1 is accepted as a no-op',()=>{
  const scratch=fs.mkdtempSync(path.join(root,'.test-data/install-env-no-npm-')),home=path.join(scratch,'home'),dest=path.join(home,'Studio');
  try{const result=spawnSync('sh',['install.sh','--home',home,'--dir',dest],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`,ALLSORTED_NO_NPM:'1'}});assert.equal(result.status,0,result.stderr||result.stdout);assert.equal(fs.existsSync(path.join(dest,'tools/carousel-builder/node_modules')),false);assert.match(result.stdout,/Carousel Builder: working/);}
  finally{fs.rmSync(scratch,{recursive:true,force:true});}
});
test('installed scripts resolve a spaced copy without CONTENT_STUDIO_DIR and render both formats',async()=>{
  const scratch=path.join(root,'.test-data','installed space regression'),home=path.join(scratch,'home dir'),dest=path.join(home,'All Sorted Studio'),run=path.join(scratch,'creative run');
  fs.rmSync(scratch,{recursive:true,force:true});fs.mkdirSync(run,{recursive:true});
  try{
    const installed=spawnSync('sh',['install.sh','--home',home,'--dir',dest,'--no-npm'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:'/opt/homebrew/bin:'+process.env.PATH}});assert.equal(installed.status,0,installed.stderr||installed.stdout);
    fs.writeFileSync(path.join(run,'brief.md'),'# Space path proof');
    fs.writeFileSync(path.join(dest,'brand/brand.json'),JSON.stringify(JSON.parse(fs.readFileSync(path.join(dest,'brand/brand.example.json'),'utf8'))));
    const env={...process.env,PATH:'/opt/homebrew/bin:'+process.env.PATH};delete env.CONTENT_STUDIO_DIR;
    const data=path.join(run,'carousel-data.json');fs.writeFileSync(data,JSON.stringify({title:'Spaced Install',preset:'square',slides:[{headline:'Start gently',body:'A simple first step.'},{headline:'Learn the basics',body:'One practical detail.'},{headline:'Take action',body:'View class times.'}]}));
    fs.mkdirSync(path.join(run,'copy'),{recursive:true});fs.writeFileSync(path.join(run,'copy/ads.json'),JSON.stringify({ads:[{creative:'carousel/carousel-spec.json',primary_text:'A welcoming class.',cta_type:'BOOK_NOW'}]}));
    const carousel=spawnSync(node,[path.join(dest,'scripts/carousel.mjs'),run],{cwd:root,encoding:'utf8',env});assert.equal(carousel.status,0,carousel.stderr||carousel.stdout);
    assert.equal(JSON.parse(fs.readFileSync(path.join(run,'carousel/carousel-spec.json'),'utf8')).callToAction,'BOOK_NOW');
    assert.equal(JSON.parse(fs.readFileSync(path.join(run,'carousel/manifest.json'),'utf8')).files.length,3);
  }finally{fs.rmSync(scratch,{recursive:true,force:true});}
});
test('--check prints the no-render self-test and writes nothing under the selected home',()=>{
  const scratch=fs.mkdtempSync(path.join(root,'.test-data/install-check-')),home=path.join(scratch,'check home'),dest=path.join(home,'Studio');fs.mkdirSync(path.join(home,'sentinel'),{recursive:true});fs.writeFileSync(path.join(home,'sentinel/keep.txt'),'unchanged');
  try{const install=spawnSync('sh',['install.sh','--home',home,'--dir',dest,'--no-npm'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`}});assert.equal(install.status,0,install.stderr||install.stdout);const before=snapshot(home);const result=spawnSync('sh',['install.sh','--check','--home',home,'--dir',dest],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`}});assert.equal(result.status,0,result.stderr||result.stdout);assert.deepEqual(snapshot(home),before);assert.match(result.stdout,/^Node: working$/m);assert.match(result.stdout,/^Chrome\/Edge: working$/m);assert.match(result.stdout,/^Carousel Builder: working$/m);}
  finally{fs.rmSync(scratch,{recursive:true,force:true});}
});
test('PowerShell installer is idempotent in a spaced home, supports --check, and installs a runnable checker', {skip:pwsh?false:'PowerShell unavailable: install.ps1 end-to-end checks require pwsh or pwsh-preview on PATH.'},()=>{
  const home=path.join(root,'.test-data/ps home dir'),dest=path.join(home,'All Sorted Studio');fs.rmSync(home,{recursive:true,force:true});
  try{
    const args=['--home',home,'--dir',dest,'--no-npm'];const first=runPwsh(args);assert.equal(first.status,0,first.stderr||first.stdout);
    const checker=fs.readFileSync(path.join(home,'.claude/agents/content-checker.md'),'utf8'),checkCommand=checker.split('\n').find(line=>line.includes('self-test --no-render'));assert.ok(checkCommand);assert.ok(checkCommand.includes(dest));
    const run=spawnSync('/bin/sh',['-c',checkCommand],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`,CONTENT_STUDIO_DIR:dest}});assert.equal(run.status,0,run.stderr||run.stdout);
    const beforeCheck=snapshot(home),check=runPwsh(['--check',...args.slice(0,4)]);assert.equal(check.status,0,check.stderr||check.stdout);assert.deepEqual(snapshot(home),beforeCheck,'--check writes nothing under the selected home');
    const beforeSecond=snapshot(home),backupsBefore=walk(home).filter(file=>file.includes('.backup-')).length,second=runPwsh(args);assert.equal(second.status,0,second.stderr||second.stdout);assert.deepEqual(snapshot(home),beforeSecond,'second PowerShell install changes zero files');assert.equal(walk(home).filter(file=>file.includes('.backup-')).length,backupsBefore,'second PowerShell install creates zero backups');
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});
test('install.sh and install.ps1 produce identical file trees apart from their substituted install path', {skip:pwsh?false:'PowerShell unavailable: installer tree parity requires pwsh or pwsh-preview on PATH.'},()=>{
  const base=path.join(root,'.test-data/installer parity'),shHome=path.join(base,'shell home'),psHome=path.join(base,'powershell home'),shDest=path.join(shHome,'All Sorted Studio'),psDest=path.join(psHome,'All Sorted Studio');fs.rmSync(base,{recursive:true,force:true});
  try{const sh=spawnSync('sh',['install.sh','--home',shHome,'--dir',shDest,'--no-npm'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:`/opt/homebrew/bin:${process.env.PATH}`}});assert.equal(sh.status,0,sh.stderr||sh.stdout);const ps=runPwsh(['--home',psHome,'--dir',psDest,'--no-npm']);assert.equal(ps.status,0,ps.stderr||ps.stdout);assert.deepEqual(contentTree(shHome),contentTree(psHome),'installed home trees match by relative path and bytes (with install-specific path values normalized)');assert.deepEqual(contentTree(shDest),contentTree(psDest),'studio trees match by relative path and bytes (with install-specific path values normalized)');}
  finally{fs.rmSync(base,{recursive:true,force:true});}
});
test('mixed offline run renders one button image and a three-slide button carousel, then creates complete handoff',async()=>{
  const run=path.join(root,'.test-data/mixed-proof-run');fs.rmSync(run,{recursive:true,force:true});fs.mkdirSync(run,{recursive:true});
  fs.rmSync(path.join(run,'images'),{recursive:true,force:true});fs.rmSync(path.join(run,'carousel'),{recursive:true,force:true});fs.writeFileSync(path.join(run,'run-log.jsonl'),'');
  fs.mkdirSync(path.join(run,'images'),{recursive:true});fs.mkdirSync(path.join(run,'carousel'),{recursive:true});fs.mkdirSync(path.join(run,'copy'),{recursive:true});
  fs.writeFileSync(path.join(run,'brief.md'),'# Sunrise Yoga Studio\n\nFictional example. Beginner-friendly yoga classes.\n');
  const brand=JSON.parse(fs.readFileSync(path.join(root,'brand/brand.example.json'),'utf8'));
  const imageData={brandName:brand.brandName,brand,hook:'A calmer start begins here',headline:'A calmer start begins here',body:'Try one gentle beginner class this week.',cta:brand.cta};
  fs.mkdirSync(path.join(run,'data'),{recursive:true});const dataPath=path.join(run,'data/sunrise-yoga_01_offer-card_square.json');fs.writeFileSync(dataPath,JSON.stringify(imageData));
  const imagePath=path.join(run,'images/sunrise-yoga_01_offer-card_square.png');
  const render=exec(['tools/ad-images/scripts/render.mjs','--template','tools/ad-images/templates/offer-card.html','--data',dataPath,'--out',imagePath,'--width','1080','--height','1080','--manifest',path.join(run,'images/manifest.json')]);assert.equal(render.status,0,render.stderr||render.stdout);
  const imageData2={...imageData,hook:'Find your first class',headline:'Find your first class',body:'Explore a calm introduction to yoga.'};const dataPath2=path.join(run,'data/sunrise-yoga_02_offer-card_square.json');fs.writeFileSync(dataPath2,JSON.stringify(imageData2));const imagePath2=path.join(run,'images/sunrise-yoga_02_offer-card_square.png');const render2=exec(['tools/ad-images/scripts/render.mjs','--template','tools/ad-images/templates/offer-card.html','--data',dataPath2,'--out',imagePath2,'--width','1080','--height','1080','--manifest',path.join(run,'images/manifest.json')]);assert.equal(render2.status,0,render2.stderr||render2.stdout);
  const carouselData={title:'sunrise-yoga',preset:'square',theme:'dark',slides:[
    {eyebrow:'WHAT GETS IN THE WAY',headline:'Starting yoga can feel unfamiliar',body:'A first class is easier when you know what to expect.'},
    {eyebrow:'FACT 1 OF 4',headline:'Begin with a gentle class',body:'A small-group introduction gives you room to learn.'},
    {eyebrow:'THE OUTCOME',headline:'Learn a few new movements',body:'Try one welcoming class at your own pace.',cta:brand.cta}
  ]};fs.writeFileSync(path.join(run,'carousel-data.json'),JSON.stringify(carouselData));
  fs.writeFileSync(path.join(run,'copy/ads.json'),JSON.stringify({ads:[
    {creative:'images/sunrise-yoga_01_offer-card_square.png',headline:'A calmer start',primary_text:'A welcoming first yoga class, at your own pace.',link_description:'View class times',cta_type:'BOOK_NOW',button_text:'See the beginner class schedule'},
    {creative:'images/sunrise-yoga_02_offer-card_square.png',headline:'Find your first class',primary_text:'Explore a calm introduction to yoga.',link_description:'See class details',cta_type:'SIGN_UP',button_text:'Join a class'},
    {creative:'carousel/carousel-spec.json',primary_text:'Take your first step with a welcoming class.',link_description:'Browse beginner sessions',cta_type:'GET_OFFER',button_text:'See the class schedule'}
  ]}));
  const car=exec(['scripts/carousel.mjs',run]);assert.equal(car.status,0,car.stderr||car.stdout);
  const renderedDeck=JSON.parse(fs.readFileSync(path.join(root,'.test-data/carousel-mixed-proof-run/studio-deck.json'),'utf8'));
  assert.equal(renderedDeck.slides[0].eyebrow,carouselData.slides[0].eyebrow);assert.equal(renderedDeck.slides[0].sub,carouselData.slides[0].body);
  assert.equal(renderedDeck.slides[1].eyebrow,'','generated item counter is removed so it cannot disagree with the slide number');assert.equal(renderedDeck.slides[1].sub,carouselData.slides[1].body);
  assert.equal(renderedDeck.slides[2].lead,carouselData.slides[2].eyebrow);assert.equal(renderedDeck.slides[2].headline,carouselData.slides[2].headline);assert.match(renderedDeck.slides[2].keyword,/See the class schedule/);assert.match(renderedDeck.slides[2].promise,/Try one welcoming class at your own pace/);
  const carRefused=exec(['scripts/carousel.mjs',run]);assert.notEqual(carRefused.status,0);assert.match(carRefused.stderr,/Use --overwrite to replace it/);
  const carOverwrite=exec(['scripts/carousel.mjs',run,'--overwrite']);assert.equal(carOverwrite.status,0,carOverwrite.stderr||carOverwrite.stdout);
  const carouselManifest=JSON.parse(fs.readFileSync(path.join(run,'carousel/manifest.json'),'utf8'));assert.deepEqual(carouselManifest.files.map(file=>file.showCta),[false,false,true]);assert.deepEqual(carouselManifest.files.map(file=>Boolean(file.measurements.cta)),[false,false,true]);for(const file of carouselManifest.files){const support=file.measurements.text.find(m=>m.kind==='supporting');const eyebrow=file.measurements.text.find(m=>m.kind==='eyebrow');const counter=file.measurements.text.find(m=>m.kind==='counter');if(support){assert.ok(support.fontSize>=44,`${file.file} support floor`);assert.ok(support.contrastRatio>=4.5,`${file.file} support contrast`);}if(eyebrow)assert.ok(eyebrow.fontSize>=32,`${file.file} eyebrow floor`);assert.ok(counter.fontSize>=28,`${file.file} counter floor`);}
  const imageManifest=JSON.parse(fs.readFileSync(path.join(run,'images/manifest.json'),'utf8'));const imageCta=imageManifest.files[0].measurements.find(measurement=>measurement.selector==='div.cta');const carouselCta=carouselManifest.files.at(-1).measurements.cta;assert.equal(imageCta.color,`rgb(${parseInt(brand.colors.ink.slice(1,3),16)}, ${parseInt(brand.colors.ink.slice(3,5),16)}, ${parseInt(brand.colors.ink.slice(5,7),16)})`);assert.equal(imageCta.background,`rgb(${parseInt(carouselCta.background.slice(1,3),16)}, ${parseInt(carouselCta.background.slice(3,5),16)}, ${parseInt(carouselCta.background.slice(5,7),16)})`,'carousel and image CTAs share the same button color in one run');assert.ok(imageCta.contrastRatio>=4.5);assert.ok(carouselCta.contrastRatio>=4.5);
  const check=exec(['scripts/studio.mjs','check',run]);assert.equal(check.status,0,check.stderr||check.stdout);
  assert.match(check.stdout,/^PASS .*sunrise-yoga_01_offer-card_square\.png: file exists - ok/m);assert.match(check.stdout,/^PASS .*sunrise-yoga_01_offer-card_square\.png: headline, body, and visible text meet minimum sizes - ok/m);
  assert.match(check.stdout,/^PASS .*sunrise-yoga_01_carousel_square\.png: text meets minimum sizes - ok/m);assert.match(check.stdout,/^PASS .*sunrise-yoga_01_carousel_square\.png: supporting text contrast is at least 4\.5:1 - ok/m);
  const savedCarouselManifest=fs.readFileSync(path.join(run,'carousel/manifest.json'),'utf8');const belowFloor=JSON.parse(savedCarouselManifest);belowFloor.files[0].measurements.text.find(m=>m.kind==='supporting').fontSize=43;belowFloor.files[0].measurements.text.find(m=>m.kind==='supporting').contrastRatio=4.49;fs.writeFileSync(path.join(run,'carousel/manifest.json'),JSON.stringify(belowFloor));const rejectedCarousel=exec(['scripts/studio.mjs','check',run]);assert.notEqual(rejectedCarousel.status,0);assert.match(rejectedCarousel.stderr,/supporting text is undersized/);assert.match(rejectedCarousel.stderr,/supporting text contrast is below 4\.5:1/);fs.writeFileSync(path.join(run,'carousel/manifest.json'),savedCarouselManifest);assert.equal(exec(['scripts/studio.mjs','check',run]).status,0);
  const sheet=exec(['scripts/studio.mjs','contact-sheet',run]);assert.equal(sheet.status,0,sheet.stderr||sheet.stdout);
  const handoff=exec(['scripts/studio.mjs','handoff',run]);assert.equal(handoff.status,0,handoff.stderr||handoff.stdout);
  const spec=JSON.parse(fs.readFileSync(path.join(run,'handoff.json'),'utf8'));
  assert.equal(spec.status,'PAUSED');assert.equal(spec.ads.length,3);assert.equal(spec.ads[0].type,'carousel');assert.deepEqual(spec.ads.slice(1).map(ad=>ad.type),['image','image']);
  assert.equal(spec.ads[0].cards.length,3);assert.equal(spec.ads[0].cards[2].headline,'Learn a few new movements');assert.equal(spec.ads[0].child_attachments.length,3);assert.equal(spec.ads[0].callToAction,'GET_OFFER');assert.equal(spec.ads[0].message,'Take your first step with a welcoming class.');
  const byImage=Object.fromEntries(spec.ads.filter(ad=>ad.type==='image').map(ad=>[path.basename(ad.image),ad]));assert.equal(byImage['sunrise-yoga_01_offer-card_square.png'].callToAction,'BOOK_NOW');assert.equal(byImage['sunrise-yoga_01_offer-card_square.png'].headline,'A calmer start');assert.equal(byImage['sunrise-yoga_01_offer-card_square.png'].primary_text,'A welcoming first yoga class, at your own pace.');assert.equal(byImage['sunrise-yoga_02_offer-card_square.png'].callToAction,'SIGN_UP');assert.equal(byImage['sunrise-yoga_02_offer-card_square.png'].headline,'Find your first class');assert.ok(spec.ads.every(ad=>ad.status==='PAUSED'));
  assert.equal(spec.blanks.pageId,'FILL_IN_META_PAGE_ID');assert.equal(spec.blanks.message,'FILL_IN_PRIMARY_MESSAGE');assert.equal(spec.blanks.link,'FILL_IN_LANDING_PAGE_URL');
  for(const f of ['contact-sheet.png','handoff.json','run-log.jsonl'])assert.ok(fs.existsSync(path.join(run,f)),`${f} exists`);
  const log=fs.readFileSync(path.join(run,'run-log.jsonl'),'utf8').trim().split('\n').at(-1);assert.equal(JSON.parse(log).qaErrors,0);assert.ok(fs.statSync(path.join(run,'contact-sheet.png')).size>10000);
  const copyPath=path.join(run,'copy/ads.json');const saved=fs.readFileSync(copyPath,'utf8');const missing=JSON.parse(saved);missing.ads=missing.ads.filter(ad=>!ad.creative.includes('02_offer-card'));fs.writeFileSync(copyPath,JSON.stringify(missing));const missingHandoff=exec(['scripts/studio.mjs','handoff',run]);assert.equal(missingHandoff.status,0,missingHandoff.stderr||missingHandoff.stdout);assert.match(missingHandoff.stderr,/WARNING: Find your first class .* has no copy entry/);const missingAd=JSON.parse(fs.readFileSync(path.join(run,'handoff.json'),'utf8')).ads.find(ad=>ad.image?.includes('02_offer-card'));assert.equal(missingAd.headline,'FILL_IN_HEADLINE');assert.equal(missingAd.message,'FILL_IN_PRIMARY_MESSAGE');const aliasProbe=JSON.parse(saved);delete aliasProbe.ads[0].cta_type;fs.writeFileSync(copyPath,JSON.stringify(aliasProbe));const aliasHandoff=exec(['scripts/studio.mjs','handoff',run]);assert.equal(aliasHandoff.status,0,aliasHandoff.stderr||aliasHandoff.stdout);assert.match(aliasHandoff.stderr,/WARNING: A calmer start begins here has no cta_type/);assert.equal(JSON.parse(fs.readFileSync(path.join(run,'handoff.json'),'utf8')).ads.find(ad=>ad.image?.includes('01_offer-card')).callToAction,'LEARN_MORE');fs.writeFileSync(copyPath,saved);assert.equal(exec(['scripts/studio.mjs','handoff',run]).status,0);fs.rmSync(path.join(root,'.test-data/carousel-mixed-proof-run'),{recursive:true,force:true});if(process.env.KEEP_STUDIO_TEST_OUTPUT!=='1')fs.rmSync(run,{recursive:true,force:true});
});

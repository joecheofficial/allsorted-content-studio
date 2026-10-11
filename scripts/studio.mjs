import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { resolveStudioRoot } = createRequire(import.meta.url)('./studio-root.cjs');
const STUDIO = resolveStudioRoot(path.dirname(fileURLToPath(import.meta.url)), path.dirname(fileURLToPath(import.meta.url))) || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(STUDIO, 'tools/video-editor/index.js'));
const { pngDimensions, findBrowser, findBrowsers } = await import(pathToFileURL(path.join(STUDIO, 'tools/ad-images/scripts/render.mjs')));
const date = new Date().toISOString().slice(0, 10);
const USAGE=`All Sorted Content Studio\n\nCommands:\n  self-test [--no-render]       Check the local tools and optionally render a test image\n  render-test                   Render one local self-test image\n  brand-json                    Generate brand/brand.json from BRAND-BRAIN.md\n  use-example-brand             Create the fictional example brand if none exists\n  new-run <slug>                Create a dated run folder and request.md\n  brief <run-dir>               Generate brief.md from request.md and brand data\n  contact-sheet <run-dir>       Build contact-sheet.png from run images\n  check <run-dir>               Run mechanical QA and append run-log.jsonl\n  handoff <run-dir>             Write a reviewed, PAUSED handoff.json`;
function say(x) { console.log(x); }
function ensureLearnings() { const file=path.join(STUDIO,'learnings/LEARNINGS.md'); if(!fs.existsSync(file)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(STUDIO,'learnings/LEARNINGS.template.md'),file);} }
function filesBelow(dir) { if (!fs.existsSync(dir)) return []; return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? (e.name === '.carousel' || e.name === '.git' || e.name === 'node_modules' ? [] : filesBelow(path.join(dir,e.name))) : [path.join(dir,e.name)]); }
function run(cmd, args, env={}) { return spawnSync(cmd,args,{cwd:STUDIO,encoding:'utf8',env:{...process.env,CONTENT_STUDIO_DIR:STUDIO,...env}}); }
async function createSheet(runDir) {
  const browserPaths=findBrowsers();if(!browserPaths.length)throw new Error('Install Google Chrome, Chromium or Microsoft Edge to build a contact sheet.');
  const imgs = filesBelow(runDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f) && path.basename(f) !== 'contact-sheet.png');
  if (!imgs.length) throw new Error('No creative images found in run directory.');
  const cards = imgs.map(f => { const ext=path.extname(f).toLowerCase(); const mime=ext==='.jpg'||ext==='.jpeg'?'image/jpeg':ext==='.webp'?'image/webp':'image/png'; const data=fs.readFileSync(f).toString('base64'); return `<figure><img src="data:${mime};base64,${data}"><figcaption>${path.relative(runDir,f).replaceAll('&','&amp;').replaceAll('<','&lt;')}</figcaption></figure>`; }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#f2efe8;color:#20231f;font:16px Arial,sans-serif}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}figure{margin:0;padding:12px;background:white;border-radius:10px;box-shadow:0 2px 10px #0002}img{display:block;width:100%;height:450px;object-fit:contain;background:#ddd}figcaption{padding:10px 2px 2px;overflow-wrap:anywhere;font-size:13px}</style><main class="grid">${cards}</main>`;
  const out = path.join(runDir, 'contact-sheet.png');
  const capturePath=path.join(runDir,`.contact-sheet-${process.pid}-${Date.now()}.png`);
  const htmlFile=path.join(STUDIO,'.test-data',`contact-sheet-${process.pid}-${Date.now()}.html`);fs.mkdirSync(path.dirname(htmlFile),{recursive:true});fs.writeFileSync(htmlFile,html);
  const height=Math.min(Math.max(1100,Math.ceil(imgs.length/3)*540+56),12000);
  const { chromeScreenshot } = require(path.join(STUDIO,'tools/carousel-builder/lib/render.js'));
  try {
    const capture=await chromeScreenshot({chromePath:browserPaths[0],url:pathToFileURL(htmlFile).href,out:capturePath,width:1440,height,timeoutMs:30000});
    if(capture.cornerCheck?.ok === false)throw new Error('Contact sheet failed paint checks: '+(capture.cornerCheck.issues||[]).join('; '));
    if(!fs.existsSync(capturePath)||fs.statSync(capturePath).size<=1000)throw new Error('Browser returned an incomplete contact sheet.');
    fs.renameSync(capturePath,out);return out;
  } finally { fs.rmSync(htmlFile,{force:true});fs.rmSync(capturePath,{force:true}); }
}
function check(runDir) {
  ensureLearnings();
  const errors=[], records=[];
  const manifests=filesBelow(runDir).filter(f=>path.basename(f)==='manifest.json');
  for(const manifestPath of manifests){
    const tool=manifestPath.includes(`${path.sep}carousel${path.sep}`)?'carousel-builder':'ad-images';
    if(tool==='ad-images'){
      try{JSON.parse(fs.readFileSync(manifestPath,'utf8'));}catch(e){const reason=`invalid JSON ${e.message}`;say(`FAIL ${path.relative(runDir,manifestPath)}: valid JSON - ${reason}`);errors.push(`${path.relative(runDir,manifestPath)}: ${reason}`);continue;}
      const result=run(process.execPath,[path.join(STUDIO,'tools/ad-images/scripts/qa.mjs'),manifestPath]);
      const output=(result.stdout+result.stderr).trim();
      const qaErrors=[...output.matchAll(/- ([^\n]+)/g)].map(match=>match[1]);
      const checks=['file exists','file size is at most 30 MB','PNG dimensions match manifest','no overflow or overlap','CTA is present','CTA has a distinct background or border','CTA text contrast is at least 4.5:1','text/background contrast is at least 4.5:1','headline, body, and visible text meet minimum sizes','story text stays inside the safe area'];
      const matchers=[/file is missing/i,/exceeds 30 MB/i,/expected .* got|Not a valid PNG/i,/overflow|overlaps/i,/CTA button is missing/i,/CTA has no distinct/i,/CTA text contrast/i,/text\/background contrast/i,/text is too small/i,/safe area/i];
      for(const item of (JSON.parse(fs.readFileSync(manifestPath,'utf8')).files||[])){
        const itemErrors=qaErrors.filter(error=>error.startsWith(`${item.file}:`));const missing=itemErrors.some(error=>/file is missing/i.test(error));
        for(let index=0;index<checks.length;index++){
          const reasons=itemErrors.filter(error=>matchers[index].test(error));if(missing&&index>0)reasons.push('not checked because the file is missing');
          say(`${reasons.length?'FAIL':'PASS'} ${path.relative(runDir,path.resolve(path.dirname(manifestPath),item.file))}: ${checks[index]}${reasons.length?` - ${reasons.join('; ')}`:' - ok'}`);
        }
      }
      records.push({tool,manifest:path.relative(runDir,manifestPath),status:result.status===0?'working':'broken',output,errors:qaErrors});
      if(result.status!==0) errors.push(`${path.relative(runDir,manifestPath)}: ${result.stderr||result.stdout}`);
      continue;
    }
    let m;try{m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));}catch(e){const reason=`invalid JSON ${e.message}`;errors.push(`${manifestPath}: ${reason}`);say(`FAIL ${path.relative(runDir,manifestPath)}: valid JSON - ${reason}`);continue;}
    const local=[];
    for(const item of m.files||[]){const file=path.resolve(path.dirname(manifestPath),item.file||'');const checks=[];const add=(name,reason='ok')=>checks.push({name,ok:reason==='ok',reason});if(!fs.existsSync(file)){add('file exists','file missing');for(const name of ['PNG dimensions match manifest','no overflow or text overlap','CTA is present','CTA has a distinct background or border','text meets minimum sizes','supporting text contrast is at least 4.5:1'])add(name,'not checked because the file is missing');for(const c of checks)say(`FAIL ${path.relative(runDir,file)}: ${c.name} - ${c.reason}`);local.push(`${item.file}: file missing`);continue;}add('file exists');try{const d=pngDimensions(file);const dimOk=d.width===item.width&&d.height===item.height;add('PNG dimensions match manifest',dimOk?'ok':`got ${d.width}x${d.height}; expected ${item.width}x${item.height}`);if(!dimOk)local.push(`${item.file}: dimensions ${d.width}x${d.height}, expected ${item.width}x${item.height}`);const overflow=Boolean(item.overflow===true||(item.overflow&&Object.values(item.overflow).some(Boolean)));add('no overflow or text overlap',overflow?'overflow reported':'ok');if(overflow)local.push(`${item.file}: overflow`);const measurements=item.measurements||{};const cta=measurements.cta;const ctaRequired=item.showCta!==false;add('CTA is present',!ctaRequired||Boolean(cta)?'ok':'CTA button is missing');if(ctaRequired&&!cta)local.push(`${item.file}: CTA button is missing`);const styled=Boolean(cta&&(cta.background&&cta.background!=='rgba(0, 0, 0, 0)'||Number.parseFloat(cta.border||0)>0));add('CTA has a distinct background or border',!cta||styled?'ok':'no distinct button background or border');if(cta&&!styled)local.push(`${item.file}: CTA has no distinct button background or border`);const ctaContrast=ctaRequired?Number(cta?.contrastRatio):4.5;const ctaBad=ctaRequired&&(!Number.isFinite(ctaContrast)||ctaContrast<4.5);add('CTA text contrast is at least 4.5:1',ctaBad?`${Number.isFinite(ctaContrast)?ctaContrast.toFixed(2):'unmeasured'}:1`:'ok');if(ctaBad)local.push(`${item.file}: CTA text contrast is below 4.5:1 (${Number.isFinite(ctaContrast)?ctaContrast.toFixed(2):'unmeasured'}:1)`);const floors=[];for(const [key,floor] of [['headline',72],['body',40],['eyebrow',32],['counter',28]]){const size=Number(measurements[key]?.fontSize||0);if(size&&size<floor){floors.push(`${key} ${size}px < ${floor}px`);local.push(`${item.file}: ${key} text is undersized (${size}px, minimum ${floor}px)`);}}if(Number(item.fontSize||0)>0&&Number(item.fontSize)<72){floors.push(`headline ${item.fontSize}px < 72px`);local.push(`${item.file}: headline text is undersized (${item.fontSize}px, minimum 72px)`);}const carouselText=Array.isArray(measurements.text)?measurements.text:[];const expected=item.expectedTextKinds||[];const typeFloors={supporting:44,visible:32,eyebrow:32,counter:28};for(const kind of expected){const observed=carouselText.filter(entry=>entry.kind===kind);if(!observed.length){floors.push(`${kind} measurement missing`);local.push(`${item.file}: ${kind} text measurement is missing`);continue;}for(const entry of observed){const minimum=typeFloors[kind]*(Number(item.width||d.width||1080)/1080);const size=Number(entry.fontSize||0);if(size<minimum){floors.push(`${kind} ${size}px < ${minimum}px`);local.push(`${item.file}: ${kind} text is undersized (${size}px, minimum ${minimum}px)`);}}}const support=carouselText.filter(entry=>entry.kind==='supporting');const contrastFailures=support.filter(entry=>!Number.isFinite(Number(entry.contrastRatio))||Number(entry.contrastRatio)<4.5);for(const entry of contrastFailures)local.push(`${item.file}: supporting text contrast is below 4.5:1 (${entry.contrastRatio ?? 'unmeasured'}:1)`);add('text meets minimum sizes',floors.length?floors.join(', '):'ok');add('supporting text contrast is at least 4.5:1',contrastFailures.length?contrastFailures.map(entry=>`${entry.contrastRatio ?? 'unmeasured'}:1`).join(', '):'ok');for(const c of checks)say(`${c.ok?'PASS':'FAIL'} ${path.relative(runDir,file)}: ${c.name}${c.ok?' - ok':` - ${c.reason}`}`);}catch(e){local.push(`${item.file}: ${e.message}`);say(`FAIL ${path.relative(runDir,file)}: PNG dimensions match manifest - ${e.message}`);for(const name of ['no overflow or text overlap','CTA is present','CTA has a distinct background or border','text meets minimum sizes','supporting text contrast is at least 4.5:1'])say(`FAIL ${path.relative(runDir,file)}: ${name} - not checked because the PNG is invalid`);}}
    records.push({tool,manifest:path.relative(runDir,manifestPath),status:local.length?'broken':'working',errors:local}); errors.push(...local);
  }
  if(!manifests.length){errors.push('No tool manifest.json found.');say(`FAIL ${path.relative(STUDIO,runDir)}: manifest discovery - No tool manifest.json found.`);}
  const briefText=fs.existsSync(path.join(runDir,'brief.md'))?fs.readFileSync(path.join(runDir,'brief.md'),'utf8'):'';
  const requested=mergeFormatCounts(parseFormatCounts(briefText.match(/^## Format and count\s*\n([\s\S]*?)(?=^## |\s*$)/m)?.[1]||''),documentedInputCounts(runDir));
  if(requested.length){
    const actual=new Map();
    for(const manifestPath of manifests){try{const data=JSON.parse(fs.readFileSync(manifestPath,'utf8'));const carousel=manifestPath.includes(`${path.sep}carousel${path.sep}`);for(const item of data.files||[]){if(carousel){const key='carousel';actual.set(key,(actual.get(key)||0)+1);}else{const ratio=item.ratio||String(item.file||'').match(/_(square|feed|story)\.png$/i)?.[1]?.toLowerCase();const key=ratio?`image:${ratio}`:'image';actual.set(key,(actual.get(key)||0)+1);actual.set('image',(actual.get('image')||0)+1);}}}catch{}}
    for(const item of requested){const key=item.format==='image'&&item.ratio?`image:${item.ratio}`:item.format;const found=actual.get(key)||0;for(let n=found;n<item.count;n++){const label=item.format==='image'?`image (${item.ratio||'unspecified ratio'})`:'carousel slide';const message=`Requested ${label} ${n+1} of ${item.count} is missing from the run.`;say(`FAIL brief.md: requested creative - ${message}`);errors.push(message);}}
  }
  const summary={time:new Date().toISOString(),checked:manifests.length,errors:errors.length,records};
  fs.appendFileSync(path.join(runDir,'run-log.jsonl'),`${JSON.stringify(summary)}\n`);
  if(errors.length) throw new Error(`QA failed: ${errors.join(' | ')}`);
  return summary;
}
const CTA_VALUES = new Set(['LEARN_MORE','SHOP_NOW','SIGN_UP','BOOK_NOW','GET_OFFER','CONTACT_US','SUBSCRIBE','DOWNLOAD']);
function readCopy(runDir) {
  const jsonPath=path.join(runDir,'copy/ads.json');
  if(!fs.existsSync(jsonPath)) return {ads:[]};
  const data=JSON.parse(fs.readFileSync(jsonPath,'utf8'));return {ads:Array.isArray(data.ads)?data.ads:[]};
}
function handoff(runDir) {
  ensureLearnings();
  const logPath=path.join(runDir,'run-log.jsonl');if(!fs.existsSync(logPath))throw new Error('Run check before creating a handoff.');const lines=fs.readFileSync(logPath,'utf8').trim().split('\n').filter(Boolean);const latest=JSON.parse(lines.at(-1));if(Number(latest.errors||0)>0)throw new Error('QA has failures. Fix them and rerun check before handoff.');
  const copy=readCopy(runDir);
  const aliases=new Map([['LEARN MORE','LEARN_MORE'],['LEARNMORE','LEARN_MORE'],['SHOP NOW','SHOP_NOW'],['SHOPNOW','SHOP_NOW'],['SIGN UP','SIGN_UP'],['SIGNUP','SIGN_UP'],['BOOK NOW','BOOK_NOW'],['BOOK A CLASS','BOOK_NOW'],['BOOK CLASS','BOOK_NOW'],['GET OFFER','GET_OFFER'],['GET OFFER NOW','GET_OFFER'],['CONTACT US','CONTACT_US'],['CONTACT','CONTACT_US'],['SUBSCRIBE','SUBSCRIBE'],['DOWNLOAD','DOWNLOAD']]);
  const pickCopy=(creative, id)=>copy.ads.find(entry=>[entry.creative,entry.file].filter(Boolean).some(key=>key===creative)||Boolean(id&&(entry.creative_id===id||entry.id===id)));
  const ctaFor=(entry,label)=>{if(entry?.cta_type){if(CTA_VALUES.has(entry.cta_type))return entry.cta_type;console.warn(`WARNING: ${label} has invalid cta_type "${entry.cta_type}"; using LEARN_MORE.`);return 'LEARN_MORE';}const raw=String(entry?.button_text||entry?.callToAction||entry?.cta||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();const mapped=aliases.get(raw);if(mapped&&CTA_VALUES.has(mapped))return mapped;console.warn(`WARNING: ${label} has no cta_type; using LEARN_MORE.`);return 'LEARN_MORE';};
  const all=filesBelow(runDir);const ads=[];const seen=new Set();
  for(const specPath of all.filter(f=>/carousel-spec\.json$/.test(f))){const spec=JSON.parse(fs.readFileSync(specPath,'utf8'));const creative=path.relative(runDir,specPath).split(path.sep).join('/');const entry=pickCopy(creative,path.basename(specPath));const label=spec.name||'Carousel';if(!entry)console.warn(`WARNING: ${label} (${creative}) has no copy entry; filling copy fields.`);const cards=(spec.cards||[]).map(card=>({...card,image:`./carousel/${path.basename(card.image)}`}));if(cards.length>=2){const cta=spec.callToAction||ctaFor(entry,label);ads.push({type:'carousel',name:label,pageId:'FILL_IN_META_PAGE_ID',message:entry?.primary_text||'FILL_IN_PRIMARY_MESSAGE',primary_text:entry?.primary_text||'FILL_IN_PRIMARY_MESSAGE',headline:'',link_description:entry?.link_description||'FILL_IN_LINK_DESCRIPTION',link:'FILL_IN_LANDING_PAGE_URL',callToAction:cta,cta_type:cta,status:'PAUSED',cards,child_attachments:cards.map(card=>({image:card.image,headline:card.headline,link:''}))});for(const card of cards)seen.add(path.basename(card.image));}}
  for(const manifestPath of all.filter(f=>path.basename(f)==='manifest.json'&&!f.includes(`${path.sep}carousel${path.sep}`))){const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));for(const item of manifest.files||[]){if(item.status!=='rendered'||!/\.png$/i.test(item.file))continue;const image=path.relative(runDir,path.resolve(path.dirname(manifestPath),item.file)).split(path.sep).join('/');if(seen.has(path.basename(item.file)))continue;const entry=pickCopy(image,path.basename(item.file));const label=item.hook||path.basename(item.file);if(!entry)console.warn(`WARNING: ${label} (${image}) has no copy entry; filling copy fields.`);const cta=ctaFor(entry,label);ads.push({type:'image',name:label,pageId:'FILL_IN_META_PAGE_ID',message:entry?.primary_text||'FILL_IN_PRIMARY_MESSAGE',primary_text:entry?.primary_text||'FILL_IN_PRIMARY_MESSAGE',link:'FILL_IN_LANDING_PAGE_URL',link_description:entry?.link_description||'FILL_IN_LINK_DESCRIPTION',callToAction:cta,cta_type:cta,status:'PAUSED',image:`./${image}`,headline:entry?.headline||'FILL_IN_HEADLINE'});seen.add(path.basename(item.file));}}
  if(!ads.length)throw new Error('No rendered image or carousel creatives found.');
  const output={status:'PAUSED',blanks:{pageId:'FILL_IN_META_PAGE_ID',link:'FILL_IN_LANDING_PAGE_URL',message:'FILL_IN_PRIMARY_MESSAGE'},ads};
  fs.writeFileSync(path.join(runDir,'handoff.json'),`${JSON.stringify(output,null,2)}\n`);const outputs=all.filter(f=>/\.(png|jpe?g|webp)$/i.test(f)&&path.basename(f)!=='contact-sheet.png').map(f=>path.relative(runDir,f));fs.appendFileSync(logPath,`${JSON.stringify({time:new Date().toISOString(),event:'run-summary',status:'PAUSED',files:outputs,handoff:'handoff.json',qaErrors:Number(latest.errors||0)})}\n`);return output;
}
function syncBrand(){const source=path.join(STUDIO,'brand/BRAND-BRAIN.md');if(!fs.existsSync(source))throw new Error('Create brand/BRAND-BRAIN.md from brand/BRAND-BRAIN.template.md first.');const text=fs.readFileSync(source,'utf8');const values={};for(const match of text.matchAll(/^- ([^:\n]+):\s*(.*)$/gm))values[match[1].trim().toLowerCase()]=match[2].trim();const get=(key,fallback='')=>{const value=values[key];return value&&!/^\[.*\]$/.test(value)?value:fallback;};const list=(value)=>value.split(/[,;]/).map(v=>v.trim()).filter(Boolean);const canvas=get('background color','#F7F2E8'),ink=get('ink color','#173B35'),accent=get('accent color','#E47C52');const colors={canvas,ink,accent,darkVariant:{canvas:get('dark canvas color',ink),ink:get('dark ink color',canvas),accent:get('dark accent color',accent)}};const fonts={display:get('display font','Georgia'),body:get('body font','Arial')};const requestedTheme=get('default theme','dark').toLowerCase();const brand={brandName:get('brand name','Your business'),offer:get('offer'),priceOrTerms:get('price or terms, if approved'),destination:get('destination'),audience:get('specific audience'),currentSituation:get('current situation'),problem:get('problem in their words'),supportedOutcome:get('desired supported outcome'),approvedProof:list(get('approved facts and proof')),testimonials:list(get('testimonials with permission','none')).filter(v=>v.toLowerCase()!=='none'),claimsToAvoid:list(get('claims to avoid')),voice:get('voice'),theme:['light','dark'].includes(requestedTheme)?requestedTheme:'dark',colors,fonts,imageDirection:get('image direction'),primaryAction:get('primary action'),cta:get('cta wording')};const dest=path.join(STUDIO,'brand/brand.json');fs.writeFileSync(dest,`${JSON.stringify(brand,null,2)}\n`);say(`Generated ${dest} from brand/BRAND-BRAIN.md`);}
function useExampleBrand(){const md=path.join(STUDIO,'brand/BRAND-BRAIN.md'),json=path.join(STUDIO,'brand/brand.json');if(fs.existsSync(md)||fs.existsSync(json))throw new Error('Refusing to overwrite an existing brand/BRAND-BRAIN.md or brand/brand.json.');fs.copyFileSync(path.join(STUDIO,'brand/BRAND-BRAIN.example.md'),md);syncBrand();}
function renderTest(){const runDir=path.join(STUDIO,'.test-data','_selftest'),imageDir=path.join(runDir,'images');fs.mkdirSync(imageDir,{recursive:true});const data=path.join(runDir,'selftest-image.json'),out=path.join(imageDir,`studio-selftest-${process.pid}_01_offer-card_square.png`),manifest=path.join(imageDir,'manifest.json');fs.writeFileSync(data,JSON.stringify({brandName:'Sunrise Yoga Studio',hook:'A calmer start begins here',body:'Try one gentle beginner class this week.',cta:'See the class schedule',brand:JSON.parse(fs.readFileSync(path.join(STUDIO,'brand/brand.example.json'),'utf8'))}));const r=run(process.execPath,[path.join(STUDIO,'tools/ad-images/scripts/render.mjs'),'--template',path.join(STUDIO,'tools/ad-images/templates/offer-card.html'),'--data',data,'--out',out,'--width','1080','--height','1080','--manifest',manifest]);if(r.status!==0)throw new Error((r.stderr||r.stdout).trim());say(`Test image: ${out}`);return out;}
function parseFormatCounts(text){
  const numbers={one:1,a:1,an:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  const result=[];const source=String(text||'');
  const pattern=/\b(one|a|an|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*(?:[- ]\s*(square|story|feed|slide))?\s*[- ]\s*(image|carousel|video)s?\b/gi;
  for(const match of source.matchAll(pattern)){const count=numbers[match[1].toLowerCase()]||Number(match[1]);const kind=match[3].toLowerCase();if(!count)continue;if(kind==='image')result.push({format:'image',ratio:match[2]?.toLowerCase()||null,count});else if(kind==='carousel')result.push({format:'carousel',count:match[2]?.toLowerCase()==='slide'?count:1});else result.push({format:'video',count});}
  return result;
}
function mergeFormatCounts(...groups){
  const counts=new Map();for(const item of groups.flat()){const key=`${item.format}:${item.ratio||''}`;const current=counts.get(key);if(!current||item.count>current.count)counts.set(key,item);}return [...counts.values()];
}
function documentedInputCounts(runDir){
  const found=[];const batchPath=path.join(runDir,'images/batch.json');
  if(fs.existsSync(batchPath)){try{const batch=JSON.parse(fs.readFileSync(batchPath,'utf8'));const variations=Array.isArray(batch.variations)?batch.variations:[];const grouped=new Map();for(const variation of variations){if((batch.format||'single')!=='single')continue;const ratio=variation.ratio||batch.ratio||'square';grouped.set(ratio,(grouped.get(ratio)||0)+1);}for(const [ratio,count] of grouped)found.push({format:'image',ratio,count});}catch{}}
  const carouselPath=path.join(runDir,'carousel-data.json');
  if(fs.existsSync(carouselPath)){try{const carousel=JSON.parse(fs.readFileSync(carouselPath,'utf8'));if(Array.isArray(carousel.slides)&&carousel.slides.length)found.push({format:'carousel',count:carousel.slides.length});}catch{}}
  return found;
}
function brief(runDir){
  const requestPath=path.join(runDir,'request.md');
  if(!fs.existsSync(requestPath))throw new Error(`Missing ${requestPath}; add the run request before generating the brief.`);
  const request=fs.readFileSync(requestPath,'utf8');
  const json=path.join(STUDIO,'brand/brand.json'); const brand=fs.existsSync(json)?JSON.parse(fs.readFileSync(json,'utf8')):{};
  const brain=path.join(STUDIO,'brand/BRAND-BRAIN.md'); const brainText=fs.existsSync(brain)?fs.readFileSync(brain,'utf8'):'';
  const pick=(key, brainKey=key)=>{const value=brand[key];if(typeof value==='string'&&value.trim())return value.trim();const m=brainText.match(new RegExp(`^- ${brainKey}:\\s*(.+)$`,'im'));return m&&!/^\[.*\]$/.test(m[1].trim())?m[1].trim():'';};
  const evidence=Array.isArray(brand.approvedProof)?brand.approvedProof.join('; '):pick('approvedProof','approved facts and proof');
  const requestedFormats=mergeFormatCounts(parseFormatCounts(request),documentedInputCounts(runDir)).map(item=>item.format==='image'?`${item.count} ${item.ratio||''} image${item.count===1?'':'s'}`.replace(/\s+/g,' ').trim():item.format==='carousel'?`${item.count===1?'1':item.count}-slide carousel`:`${item.count} video${item.count===1?'':'s'}`).join(', ');
  const fields={Goal:request.trim(),Offer:pick('offer'),Audience:pick('audience','specific audience'),Problem:pick('problem','problem in their words'), 'Supported outcome':pick('supportedOutcome','desired supported outcome'), 'Approved evidence':evidence, 'Format and count':requestedFormats,CTA:pick('cta','cta wording')||pick('primaryAction','primary action'),Destination:pick('destination')};
  const unresolved=Object.entries(fields).filter(([,value])=>!value).map(([key])=>key);
  const body=Object.entries(fields).map(([key,value])=>`## ${key}\n${value||'[Unresolved]'}\n`).join('\n');
  const output=`# Creative brief\n\nGenerated: ${date}\n\n${body}\n## Constraints\n${pick('claimsToAvoid','claims to avoid')||'[Unresolved]'}\n\n## Unresolved items\n${unresolved.length?unresolved.map(key=>`- ${key}`).join('\n'):'- None'}\n`;
  fs.writeFileSync(path.join(runDir,'brief.md'),output);say(`Wrote ${path.join(runDir,'brief.md')}`);
}
function selfTest({noRender=false}={}){let failed=false;const [major,minor]=process.versions.node.split('.').map(Number),nodeOk=major>20||(major===20&&minor>=9);say(`Node: ${nodeOk?'working':`broken, ${process.versions.node} is below 20.9`}`);if(!nodeOk)failed=true;const browserOk=Boolean(findBrowser());say(`Chrome/Edge: ${browserOk?'working':'Install Google Chrome to run the browser renderer.'}`);if(!browserOk)failed=true;
  const carouselSource=fs.existsSync(path.join(STUDIO,'tools/carousel-builder/bin/carousel.js'));const carouselInstalled=fs.existsSync(path.join(STUDIO,'tools/carousel-builder/package.json'));
const tools=[['HookLab',fs.existsSync(path.join(STUDIO,'tools/hooklab/SKILL.md')),'missing HookLab files'],['Ad Images',fs.existsSync(path.join(STUDIO,'tools/ad-images/scripts/render.mjs'))&&browserOk,'renderer or browser missing'],['Carousel Builder',carouselSource&&carouselInstalled,'engine source missing'],['HeyGen Ad Videos',fs.existsSync(path.join(STUDIO,'tools/heygen-ad-videos/scripts/heygen.mjs')),'missing HeyGen files'],['Video Editor',fs.existsSync(path.join(STUDIO,'tools/video-editor/index.js')),'missing video editor files'],['Launch Video',fs.existsSync(path.join(STUDIO,'tools/launch-video/brag/SKILL.md'))&&fs.existsSync(path.join(STUDIO,'tools/launch-video/brag-slim/SKILL.md')),'missing launch video files']];for(const [name,ok,why] of tools){if(name==='Video Editor'&&ok){const mod=require(path.join(STUDIO,'tools/video-editor/index.js'));const check=mod.check();say(check.ffmpegAvailable?'Video Editor: working':'Video Editor: ffmpeg not installed (optional)');continue;}if(name==='HeyGen Ad Videos'){say(`HeyGen Ad Videos: ${ok?'working (connection optional)':'broken, '+why}`);continue;}say(`${name}: ${ok?'working':`broken, ${why}`}`);if(!ok)failed=true;}
  if(!noRender){try{renderTest();}catch(e){say(`Ad Images render: broken, ${e.message}`);failed=true;}}if(failed)process.exitCode=1;
}
const [cmd,arg] = process.argv.slice(2);
try {
 if(!cmd){say(USAGE);}
 else if(cmd==='self-test'){selfTest({noRender:process.argv.includes('--no-render')});}
 else if(cmd==='render-test'){renderTest();}
 else if(cmd==='brand-json'){syncBrand();}
 else if(cmd==='use-example-brand'){useExampleBrand();}
 else if(cmd==='new-run'){if(!arg)throw new Error('Usage: studio.mjs new-run <slug>');const slug=arg.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48);if(!slug)throw new Error('Use a slug with letters or numbers.');const dir=path.join(STUDIO,'runs',`${date}-${slug}`);fs.mkdirSync(dir,{recursive:false});fs.writeFileSync(path.join(dir,'request.md'),'[Describe the campaign goal, formats, quantity, CTA, supplied proof, and constraints.]\n');say(dir);}
 else if(cmd==='brief'){if(!arg)throw new Error('Usage: studio.mjs brief <run-dir>');brief(path.resolve(arg));}
 else if(cmd==='contact-sheet'){if(!arg)throw new Error('Usage: studio.mjs contact-sheet <run-dir>');say(await createSheet(path.resolve(arg)));}
 else if(cmd==='check'){if(!arg)throw new Error('Usage: studio.mjs check <run-dir>');check(path.resolve(arg));}
 else if(cmd==='handoff'){if(!arg)throw new Error('Usage: studio.mjs handoff <run-dir>');handoff(path.resolve(arg));say(`Wrote ${path.join(path.resolve(arg),'handoff.json')} in PAUSED state.`);}
 else if(cmd!=='self-test'&&cmd!=='render-test'&&cmd!=='brand-json'&&cmd!=='use-example-brand'&&cmd!=='new-run'&&cmd!=='contact-sheet'&&cmd!=='check'&&cmd!=='handoff'&&cmd!=='brief')throw new Error(`${USAGE}\n\nUnknown command: ${cmd}`);
}catch(e){console.error(e.message);process.exitCode=1;}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveCtaColors } from './cta-colors.mjs';
import { createRequire } from 'node:module';
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const require=createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const { resolveStudioRoot } = require('./studio-root.cjs');
const studioRoot = resolveStudioRoot(scriptDir, path.dirname(scriptDir));
const { chromeScreenshot } = require(studioRoot ? path.join(studioRoot, 'tools/carousel-builder/lib/render.js') : '../../carousel-builder/lib/render.js');

export function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) result[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  }
  return result;
}

export function findBrowsers(platform = process.platform, env = process.env) {
  const chrome=[],edge=[];
  if(platform==='darwin'){chrome.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',path.join(env.HOME||os.homedir(),'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));edge.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');}
  else if(platform==='win32'){const bases=[env.PROGRAMFILES,env['PROGRAMFILES(X86)'],env.LOCALAPPDATA].filter(Boolean);for(const base of bases)chrome.push(path.join(base,'Google/Chrome/Application/chrome.exe'));for(const base of bases)edge.push(path.join(base,'Microsoft/Edge/Application/msedge.exe'));}
  else {const root=path.parse(process.execPath).root;chrome.push(path.join(root,'usr/bin/google-chrome'),path.join(root,'usr/bin/google-chrome-stable'));edge.push(path.join(root,'usr/bin/microsoft-edge'));}
  const dirs=String(env.PATH||'').split(path.delimiter).filter(Boolean);for(const name of platform==='win32'?['chrome.exe']:['google-chrome','google-chrome-stable'])for(const dir of dirs)chrome.push(path.join(dir,name));for(const dir of dirs)edge.push(path.join(dir,platform==='win32'?'msedge.exe':'microsoft-edge'));
  return [...chrome,...edge].filter((candidate,index,all)=>all.indexOf(candidate)===index&&fs.existsSync(candidate));
}
export function findBrowser(platform = process.platform, env = process.env) { return findBrowsers(platform,env)[0]||null; }

export function pngDimensions(file) {
  const bytes = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) throw new Error(`Not a valid PNG: ${file}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function contrastRatio(foreground, background) {
  const parse=value=>{const s=String(value||'').trim();const m=s.match(/^#([\da-f]{3}|[\da-f]{6})$/i);if(m){const h=m[1].length===3?[...m[1]].map(x=>x+x).join(''):m[1];return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}const rgb=s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);return rgb?[+rgb[1],+rgb[2],+rgb[3]]:null;};
  const luminance=value=>{const c=parse(value);if(!c)return null;const [r,g,b]=c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;};
  const a=luminance(foreground),b=luminance(background);return a===null||b===null?null:(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

function safeCss(value, fallback) {
  const text = String(value || fallback);
  return /[;{}<>]/.test(text) ? fallback : text;
}

function imageDataUrl(file) {
  const imagePath = path.resolve(file);
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(imagePath).toLowerCase()];
  if (!mime) throw new Error('Supplied image must be PNG, JPEG, WebP or GIF.');
  if (fs.statSync(imagePath).size > 16 * 1024 * 1024) throw new Error('Supplied image exceeds 16 MiB.');
  const bytes = fs.readFileSync(imagePath);
  const valid = mime === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mime === 'image/webp' ? bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' : /^GIF8[79]a$/.test(bytes.subarray(0,6).toString());
  if (!valid) throw new Error('Supplied image bytes do not match its image format.');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export function makeHtml(template, data, width, height) {
  const brand = data.brand || {};
  const colors = brand.colors || {};
  const fonts = brand.fonts || {};
  const requestedTheme = data.theme || brand.theme || 'dark';
  const theme = requestedTheme === 'light' ? 'light' : 'dark';
  const dark = colors.darkVariant || { canvas: colors.ink, ink: colors.canvas || colors.background, accent: colors.accent };
  const themedColors = theme === 'dark'
    ? { canvas: dark.canvas || colors.ink || '#173B35', ink: dark.ink || colors.canvas || colors.background || '#F7F2E8', accent: dark.accent || colors.accent || '#E47C52' }
    : { canvas: colors.canvas || colors.background || '#F7F2E8', ink: colors.ink || '#173B35', accent: colors.accent || '#E47C52' };
  const ctaColors = resolveCtaColors({ accent: themedColors.accent, ink: colors.ink || '#173B35', canvas: colors.canvas || colors.background || '#F7F2E8', surface: themedColors.canvas });
  const button = ctaColors.button;
  const ctaText = ctaColors.text;
  const values = {
    BACKGROUND: safeCss(themedColors.canvas, '#F7F2E8'), INK: safeCss(themedColors.ink, '#173B35'), ACCENT: safeCss(button, '#E47C52'),
    DISPLAY_FONT: safeCss(fonts.display, 'Georgia'), BODY_FONT: safeCss(fonts.body, 'Arial'), BRAND: data.brandName || brand.brandName || 'Your business',
    HOOK: data.hook || data.headline || '', HEADLINE: data.headline || '', BODY: data.body || '', CTA: data.cta || '',
    TIP1: data.tips?.[0] || data.tip1 || '', TIP2: data.tips?.[1] || data.tip2 || '', TIP3: data.tips?.[2] || data.tip3 || '', PROOF: data.proof || '',
    IMAGE_SRC: data.image ? imageDataUrl(data.image) : ''
  };
  let html = template.replace('--w:1080px;--h:1080px', `--w:${width}px;--h:${height}px`);
  if (Number(height) / Number(width) === 1920 / 1080) {
    html = html.replace('</style>', '.canvas{position:absolute!important;top:14%!important;left:8%!important;height:66%!important;width:84%!important;margin:0!important;padding:56px 7.4vw!important;justify-content:space-around!important}h1{font-size:120px!important;line-height:1.04!important;max-height:none!important;overflow:visible!important}p,.proof,.tip,.foot{font-size:52px!important;line-height:1.18!important}.cta{font-size:54px!important;background:var(--accent)!important;color:var(--ink)!important;padding:22px 36px!important;border-radius:16px!important;margin-top:42px!important;align-self:flex-start!important}.brand{font-size:48px!important}.arrow{font-size:52px!important}</style>');
    html = html.replace(/data-layout-box="[^"]+"/g, 'data-layout-box="0.08,0.14,0.84,0.66"');
  }
  html=html.replace('</style>','.canvas h1{height:auto!important;max-height:none!important;overflow:visible!important;padding-bottom:8px!important}</style>');
  html=html.replace('</style>',`:root{--paper:${safeCss(themedColors.canvas,'#F7F2E8')}!important;--ink:${safeCss(themedColors.ink,'#173B35')}!important;--accent:${safeCss(button,'#E47C52')}!important;--cta-text:${safeCss(ctaText,'#173B35')}!important}body{background:${safeCss(themedColors.canvas,'#F7F2E8')}!important;color:${safeCss(themedColors.ink,'#173B35')}!important}.cta{background:var(--accent)!important;color:var(--cta-text)!important}</style>`);
  for (const [key, value] of Object.entries(values)) html = html.replaceAll(`{{${key}}}`, escapeHtml(String(value)));
  html = html.replace('</body>', `<script>
  (()=>{
    const headline=document.querySelector('h1');
    const floor=72;
    function inspect(){
      const canvas=document.querySelector('.canvas');
      const canvasRect=canvas.getBoundingClientRect();
      const nodes=[...document.querySelectorAll('h1,p,.cta,.brand,.proof,.tip,.foot,.note,.label,.eyebrow,.arrow')]
        .filter(node=>!node.parentElement.closest('h1,p,.cta,.brand,.proof,.tip,.foot,.note,.label,.eyebrow,.arrow'));
      const elements=nodes.map((node,index)=>{
        const rect=node.getBoundingClientRect();
        const overflow=node.scrollHeight>node.clientHeight+1||node.scrollWidth>node.clientWidth+1||rect.left<canvasRect.left-1||rect.top<canvasRect.top-1||rect.right>canvasRect.right+1||rect.bottom>canvasRect.bottom+1;
        const style=getComputedStyle(node); const luminance=value=>{const m=value.match(/\\d+/g);if(!m||m.length<3)return 0;const c=m.slice(0,3).map(x=>+x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const l1=luminance(style.color),l2=luminance(style.backgroundColor); const contrastRatio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); return {index,selector:node.tagName.toLowerCase()+(node.className&&typeof node.className==='string'?'.'+node.className.trim().replace(/\\s+/g,'.'):''),background:style.backgroundColor,color:style.color,contrastRatio,borderWidth:style.borderTopWidth,text:(node.innerText||node.textContent||'').trim(),fontSize:Math.round(parseFloat(style.fontSize)),overflow,overlaps:[],scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,rect:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}};
      });
      for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++){
        const a=elements[i].rect,b=elements[j].rect;
        if(a.x<b.x+b.width-1&&a.x+a.width>b.x+1&&a.y<b.y+b.height-1&&a.y+a.height>b.y+1){elements[i].overlaps.push(j);elements[j].overlaps.push(i);elements[i].overflow=true;elements[j].overflow=true;}
      }
      return elements;
    }
    addEventListener('load',()=>{
      if(headline){
        let size=parseFloat(getComputedStyle(headline).fontSize);
        let result=inspect();
        while(size>floor&&result.some(item=>item.overflow)){
          size=Math.max(floor,size-4);headline.style.fontSize=size+'px';
          result=inspect();
        }
        headline.dataset.fontSize=String(Math.round(size));
      }
      const result=inspect();
      const payload=JSON.stringify({elements:result,headlineFontSize:headline?Math.round(parseFloat(getComputedStyle(headline).fontSize)):null});
      document.body.insertAdjacentHTML('beforeend','<pre id="render-measurements" style="display:none">'+btoa(unescape(encodeURIComponent(payload)))+'</pre>');
    });
  })();
  </script></body>`);
  return html;
}

export function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function textLimit(element) {
  const selector = element.selector || '';
  if (/(^|\.)cta($|\.)/i.test(selector)) return { name: 'CTA', limit: 36, unit: 'characters' };
  if (/(^|\.)label($|\.)|(^|\.)eyebrow($|\.)/i.test(selector)) return { name: 'eyebrow', limit: 6, unit: 'words' };
  if (selector === 'h1' || selector.startsWith('h1.')) return { name: 'hook/headline', limit: 12, unit: 'words' };
  return { name: 'body', limit: 24, unit: 'words' };
}
function overflowAdvice(element, elements) {
  const countText = item => String(item.text || '').trim();
  const countFor = (item, unit) => unit === 'characters' ? countText(item).length : countText(item).split(/\s+/).filter(Boolean).length;
  const own = textLimit(element), current = countFor(element, own.unit);
  if (current > own.limit) return `Shorten ${own.name} to ${own.limit} ${own.unit} maximum (current: ${current} ${own.unit}, ${current - own.limit} over).`;
  const preceding = elements.slice(0, element.index).filter(item => {
    const limit = textLimit(item);
    return countFor(item, limit.unit) > limit.limit;
  }).map(item => {
    const limit = textLimit(item), count = countFor(item, limit.unit);
    return `${limit.name} is ${count - limit.limit} ${limit.unit} over its ${limit.limit} ${limit.unit} limit`;
  });
  return preceding.length
    ? `${element.selector} is pushed below the story safe zone by content above it: ${preceding.join(' and ')}.`
    : `Adjust the content above ${element.selector} to keep it inside the safe zone.`;
}

export async function render({ templatePath, dataPath, data: suppliedData, outPath, width, height, browser = findBrowser(), overwrite = false }) {
  if(fs.existsSync(path.resolve(outPath))&&!overwrite)throw new Error(`Refusing to overwrite existing creative: ${path.resolve(outPath)}. Use --overwrite to replace it.`);
  if (!browser) throw new Error('Install Google Chrome to run the browser renderer.');
  const data = suppliedData || (dataPath ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : {});
  if (!data.theme && dataPath) {
    for (const dir of [path.dirname(path.resolve(dataPath)), path.dirname(path.dirname(path.resolve(dataPath)))]) {
      const brief = path.join(dir, 'brief.md');
      if (!fs.existsSync(brief)) continue;
      const match = fs.readFileSync(brief, 'utf8').match(/^\s*(?:visual\s+)?theme\s*:\s*(light|dark)\s*$/im);
      if (match) { data.theme = match[1].toLowerCase(); break; }
    }
  }
  const studioBrandPath = studioRoot && path.join(studioRoot, 'brand', 'brand.json');
  if (studioBrandPath && fs.existsSync(studioBrandPath)) { const shared = JSON.parse(fs.readFileSync(studioBrandPath, 'utf8')); data.brand = { ...(data.brand || {}), ...shared }; data.brandName = data.brandName || shared.brandName; }
  else console.log('Brand file not found, using default colours');
  const template = fs.readFileSync(templatePath, 'utf8');
  const html = makeHtml(template, data, width, height);
  const tempRoot = path.join(studioRoot || path.dirname(scriptDir), '.test-data');
  fs.mkdirSync(tempRoot,{recursive:true});
  const temp = path.join(tempRoot, `ad-creative-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(temp, html);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  const finalPath=path.resolve(outPath);
  const renderPath=path.join(tempRoot, `render-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  try{
    // Keep capture and layout measurements in the same isolated browser page.
    // The bundled capture driver sets the exact viewport and waits for paint.
    const token = randomBytes(24).toString('hex');
    let resolveMeasurements;
    const measured = new Promise(resolve => { resolveMeasurements = resolve; });
    const server = http.createServer((request, response) => {
      if (request.url === `/${token}` && request.method === 'GET') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        const notify = `<script>addEventListener('load',()=>{const node=document.getElementById('render-measurements');if(node)fetch('/${token}/measurements',{method:'POST',body:node.textContent})})</script>`;
        response.end(html.replace('</body>', `${notify}</body>`));
      } else if (request.url === `/${token}/measurements` && request.method === 'POST') {
        let body = '';
        request.on('data', chunk => { body += chunk; if (body.length > 2 * 1024 * 1024) request.destroy(); });
        request.on('end', () => { resolveMeasurements(body); response.end('OK'); });
      } else { response.statusCode = 404; response.end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    let encoded;
    try {
      const address = server.address();
      const capture = await chromeScreenshot({ chromePath: browser, url: `http://127.0.0.1:${address.port}/${token}`, out: renderPath, width: Number(width), height: Number(height), settle: measured, settleMs: 3000, timeoutMs: 30000 });
      if (capture.cornerCheck?.ok === false) throw new Error('Browser capture failed its paint check; no creative was accepted.');
      // A capture without measured QA data must never be accepted.
      encoded = await Promise.race([measured, new Promise(resolve => { const timer = setTimeout(() => resolve(null), 1000); timer.unref(); })]);
    } finally { await new Promise(resolve => server.close(resolve)); }
    if (!encoded) throw new Error('Browser did not return the renderer measurements.');
    const diagnostics = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const overflows=diagnostics.elements.filter(item=>item.overflow);
    if(overflows.length){
      const details=overflows.map(item=>`${item.selector} (${item.fontSize}px at ${item.rect.x},${item.rect.y} ${item.rect.width}x${item.rect.height}, scroll ${item.scrollWidth}x${item.scrollHeight} client ${item.clientWidth}x${item.clientHeight}${item.overlaps.length?`, overlaps ${item.overlaps.join(',')}`:''})`).join(', ');
      const advice=[...new Set(overflows.map(item=>overflowAdvice(item,diagnostics.elements)))].join(' ');
      throw new Error(`Image text still overflows. ${advice} Elements: ${details}`);
    }
    const dimensions=pngDimensions(renderPath);
    if(dimensions.width!==Number(width)||dimensions.height!==Number(height)) throw new Error(`Expected ${width}x${height}; got ${dimensions.width}x${dimensions.height}`);
    fs.renameSync(renderPath, finalPath);
    return {...dimensions,measurements:diagnostics.elements,headlineFontSize:diagnostics.headlineFontSize};
  }finally{
    try{fs.unlinkSync(renderPath)}catch{}
    try{fs.unlinkSync(temp)}catch{}
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.template || !args.out || !args.width || !args.height) {
    console.error('Usage: node render.mjs --template FILE --data FILE --out PNG --width W --height H'); process.exit(2);
  }
  const browser = findBrowser();
  if (!browser) { console.error('Install Google Chrome to run the browser renderer.'); process.exit(2); }
  try {
    const dimensions = await render({ templatePath: args.template, dataPath: args.data, outPath: args.out, width: Number(args.width), height: Number(args.height), browser, overwrite: args.overwrite === true });
    if(args.manifest){
      const manifestPath=path.resolve(args.manifest);
      const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{files:[]};
      const relative=path.relative(path.dirname(manifestPath),path.resolve(args.out)).split(path.sep).join('/');
      const data=args.data?JSON.parse(fs.readFileSync(args.data,'utf8')):{};
      const sharedPath=studioRoot&&path.join(studioRoot,'brand/brand.json');const shared=sharedPath&&fs.existsSync(sharedPath)?JSON.parse(fs.readFileSync(sharedPath,'utf8')):{};const brand={...shared,...(data.brand||{})};const colors=brand.colors||{};const theme=(data.theme||brand.theme||'dark')==='light'?'light':'dark';const dark=colors.darkVariant||{};const canvasColor=theme==='dark'?(dark.canvas||colors.ink||'#173B35'):(colors.canvas||colors.background||'#F7F2E8');
      const ratio=Number(args.height)/Number(args.width)===1920/1080?'story':Number(args.height)/Number(args.width)===1350/1080?'feed':'square';
      const entry=manifest.files.find(file=>file.file===relative)||{file:relative,hook:data.hook||data.headline||'',width:Number(args.width),height:Number(args.height),ratio,template:path.basename(args.template,'.html'),layoutBox:ratio==='story'?[0.08,0.14,0.84,0.66]:null};
      const foregrounds=dimensions.measurements.filter(element=>element.text&&element.selector!== 'div.cta').map(element=>contrastRatio(element.color,canvasColor)).filter(Number.isFinite);
      const textContrastRatio=foregrounds.length?Math.min(...foregrounds):null;
      Object.assign(entry,{status:'rendered',headlineFontSize:dimensions.headlineFontSize,measurements:dimensions.measurements,overflow:dimensions.measurements.some(element=>element.overflow),canvasColor,textContrastRatio});
      if(!manifest.files.includes(entry))manifest.files.push(entry);
      fs.writeFileSync(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
    }
    console.log(`Rendered ${args.out} (${dimensions.width}x${dimensions.height})`);
  } catch (error) { console.error(error.message); process.exit(1); }
}

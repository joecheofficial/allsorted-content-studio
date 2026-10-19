param()
$ErrorActionPreference = 'Stop'
$dir=$null; $installHome=$null; $check=$false; $noNpm=($env:ALLSORTED_NO_NPM -eq '1'); $Options=$args
for ($i=0; $i -lt $Options.Count; $i++) {
  if ($Options[$i] -in @('--dir','-dir')) { $i++; if ($i -ge $Options.Count) { throw 'Provide a folder after --dir.' }; $dir=$Options[$i] }
  elseif ($Options[$i] -in @('--home','-home')) { $i++; if ($i -ge $Options.Count) { throw 'Provide a folder after --home.' }; $installHome=$Options[$i] }
  elseif ($Options[$i] -eq '--check') { $check=$true }
  elseif ($Options[$i] -eq '--no-npm') { $noNpm=$true }
  else { throw "Unknown option: $($Options[$i])" }
}
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $installHome) { $installHome = $HOME }
if (-not $dir) { $dir = Join-Path $installHome 'allsorted-content-studio' }
if (-not [System.IO.Path]::IsPathRooted($dir)) { $dir = Join-Path (Get-Location) $dir }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 20.9 or later is required.' }
$nodeVersion = & $node.Source -p 'process.versions.node'
$version = $nodeVersion -split '\.'
if ([int]$version[0] -lt 20 -or ([int]$version[0] -eq 20 -and [int]$version[1] -lt 9)) { throw "Node.js 20.9 or later is required. Found $nodeVersion." }
if ($check) {
  $checkRoot=$src
  if (Test-Path (Join-Path $dir 'scripts/studio.mjs')) { $checkRoot=$dir }
  $required=@('README.md','DIRECTOR.md','INSTALL-PROMPT.md','AGENTS.md','VERSION','CHANGELOG.md','package.json','scripts/studio.mjs','scripts/carousel.mjs','scripts/install-files.mjs','skill/SKILL.md','docs/DATA-FORMATS.md','brand/BRAND-BRAIN.template.md','brand/BRAND-BRAIN.example.md','brand/brand.example.json','tools/hooklab/SKILL.md','tools/ad-images/scripts/render.mjs','tools/ad-images/scripts/cta-colors.mjs','tools/carousel-builder/bin/carousel.js','tools/heygen-ad-videos/scripts/heygen.mjs','tools/video-editor/index.js','tools/video-editor/hyperframes.js','tools/video-editor/INSTALL-HYPERFRAMES.md','scripts/hyperframes-setup.mjs','tools/launch-video/brag/SKILL.md','tools/launch-video/brag-slim/SKILL.md','agents/content-checker.md','agents/content-copywriter.md','agents/content-carousel-maker.md','agents/content-director.md','agents/content-hook-writer.md','agents/content-image-maker.md','agents/content-launch-video.md','agents/content-video-editor.md','agents/content-video-maker.md')
  $missing=$false
  foreach ($file in $required) { if (-not (Test-Path (Join-Path $checkRoot $file))) { Write-Output "Required file: missing $file"; $missing=$true } }
  $env:CONTENT_STUDIO_DIR=$checkRoot
  & $node.Source (Join-Path $checkRoot 'scripts/studio.mjs') self-test --no-render
  $selfStatus=$LASTEXITCODE
  if ($missing -or $selfStatus -ne 0) { exit 1 }
  exit 0
}
function Add-BrowserCandidate([System.Collections.Generic.List[string]]$Candidates, [string]$Base, [string]$Relative) {
  if (-not [string]::IsNullOrWhiteSpace($Base)) { $Candidates.Add((Join-Path $Base $Relative)) }
}
$browsers=[System.Collections.Generic.List[string]]::new()
if ($IsWindows -or $env:OS -eq 'Windows_NT') {
  Add-BrowserCandidate $browsers $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'
  Add-BrowserCandidate $browsers ${env:ProgramFiles(x86)} 'Google/Chrome/Application/chrome.exe'
  Add-BrowserCandidate $browsers $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe'
  Add-BrowserCandidate $browsers $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe'
  Add-BrowserCandidate $browsers ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'
  Add-BrowserCandidate $browsers $env:LOCALAPPDATA 'Microsoft/Edge/Application/msedge.exe'
  foreach ($key in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe')) {
    try { $value=(Get-Item $key -ErrorAction Stop).GetValue(''); if ($value) { $browsers.Add([string]$value) } } catch {}
  }
  foreach ($name in @('chrome','msedge')) { $command=Get-Command $name -ErrorAction SilentlyContinue; if ($command) { $browsers.Add($command.Source) } }
} elseif ($IsMacOS) {
  foreach ($name in @('google-chrome','google-chrome-stable','microsoft-edge')) { $command=Get-Command $name -ErrorAction SilentlyContinue; if ($command) { $browsers.Add($command.Source) } }
  foreach ($app in @('Google Chrome','Microsoft Edge')) { try { $null = & open -Ra $app 2>$null; if ($LASTEXITCODE -eq 0) { $browsers.Add('/Applications/' + $app + '.app') } } catch {} }
  Add-BrowserCandidate $browsers $installHome 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  Add-BrowserCandidate $browsers '/Applications' 'Google Chrome.app/Contents/MacOS/Google Chrome'
  Add-BrowserCandidate $browsers '/Applications' 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
} else {
  foreach ($name in @('google-chrome','google-chrome-stable','microsoft-edge')) { $command=Get-Command $name -ErrorAction SilentlyContinue; if ($command) { $browsers.Add($command.Source) } }
}
if (-not ($browsers | Where-Object { $_ -and (Test-Path $_) })) { throw 'Install Google Chrome or Microsoft Edge, then run this installer again.' }
& $node.Source (Join-Path $src 'scripts/install-files.mjs') $src $dir $installHome
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# Kept for compatibility: the pinned carousel engine has zero npm dependencies.
$env:CONTENT_STUDIO_DIR=$dir
& $node.Source (Join-Path $dir 'scripts/studio.mjs') self-test --no-render
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Weekly self-update: on by default. Set CONTENT_STUDIO_SKIP_UPDATES=1 to skip.
$updateRoot = $null
if (Test-Path (Join-Path $src '.git')) { $updateRoot = $src } elseif (Test-Path (Join-Path $dir '.git')) { $updateRoot = $dir }
Write-Output ''
if ($env:CONTENT_STUDIO_SKIP_UPDATES -eq '1' -or $env:ALLSORTED_AUTO_UPDATE -eq '0') {
  Write-Output "Weekly updates not scheduled (CONTENT_STUDIO_SKIP_UPDATES=1). Later: node `"$(Join-Path $src 'scripts/self-update.js')`" --register"
} elseif (-not $updateRoot) {
  Write-Output 'Weekly updates need a git clone. Install with git clone to get them automatically.'
} else {
  & $node.Source (Join-Path $updateRoot 'scripts/self-update.js') --register
  if ($LASTEXITCODE -ne 0) { Write-Output "Weekly updates could not be scheduled. Try later: node `"$(Join-Path $updateRoot 'scripts/self-update.js')`" --register" }
}

# HyperFrames for the Video Editor is part of the standard install (see install.sh).
# It always lets the install finish. CONTENT_STUDIO_SKIP_HYPERFRAMES=1 skips it.
& $node.Source (Join-Path $dir 'scripts/hyperframes-setup.mjs') --home $installHome
if ($LASTEXITCODE -ne 0) { Write-Output "HyperFrames setup did not finish. Run the prompt in $(Join-Path $dir 'tools/video-editor/INSTALL-HYPERFRAMES.md')" }

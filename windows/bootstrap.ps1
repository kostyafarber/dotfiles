# Windows bootstrap — the Windows counterpart to nix/home/common.nix.
# Clone this repo to ~/.dotfiles, then from a normal (non-admin) PowerShell:
#   powershell -ExecutionPolicy Bypass -File ~/.dotfiles/windows/bootstrap.ps1
# It runs bootstrap-admin.ps1 elevated (one UAC prompt), then the per-user setup.
# The elevated half logs to %LOCALAPPDATA%\dotfiles\bootstrap-admin.log; leave its
# window open until it closes itself.

$ErrorActionPreference = 'Stop'
$dotfiles = "$HOME\.dotfiles"

# ---------------------------------------------------------------------------
# machine-level half (packages, sshd, RDP, firewall, hostname)
# ---------------------------------------------------------------------------
if (-not $env:SKIP_ADMIN) {
  $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$PSScriptRoot\bootstrap-admin.ps1"
  )
  if ($p.ExitCode -ne 0) { throw "bootstrap-admin.ps1 failed ($($p.ExitCode))" }
}

# Pick up PATH changes from the installs
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

# ---------------------------------------------------------------------------
# git — mirrors programs.git / programs.delta in nix/home/common.nix
# ---------------------------------------------------------------------------
git config --global user.name 'Kostya Farber'
git config --global user.email 'kostya.farber@gmail.com'
git config --global init.defaultBranch main
git config --global core.autocrlf input
git config --global core.symlinks true
git config --global core.longpaths true

git config --global core.pager delta
git config --global interactive.diffFilter 'delta --color-only'
git config --global delta.navigate true
git config --global delta.light true
git config --global delta.line-numbers true
git config --global delta.syntax-theme GitHub
git config --global merge.conflictStyle zdiff3

# Use gh's login for https pushes
gh auth setup-git

# ---------------------------------------------------------------------------
# toolchains
# ---------------------------------------------------------------------------
# Shift's rust-toolchain.toml pins its own version; stable is the fallback
rustup default stable

fnm install 24
fnm default 24
# corepack is no longer bundled with Node; pnpm 11 switches to the repo's
# packageManager version on its own
# (fnm exec can't launch npm.cmd, so load fnm's env into this shell instead)
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24
npm install -g pnpm@11

# ---------------------------------------------------------------------------
# config links — live symlinks into the repo, like mkOutOfStoreSymlink
# ---------------------------------------------------------------------------
function Link($target, $path) {
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  if (Test-Path $path) { Remove-Item $path -Recurse -Force }
  # Windows PowerShell's New-Item ignores Developer Mode and demands admin;
  # mklink creates unprivileged symlinks when Developer Mode is on
  $flag = if (Test-Path $target -PathType Container) { '/D ' } else { '' }
  cmd /c "mklink $flag`"$path`" `"$target`"" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "mklink failed for $path" }
  Write-Host "linked $path"
}

$documents = [Environment]::GetFolderPath('MyDocuments')
Link "$dotfiles\windows\profile.ps1"                 "$documents\PowerShell\Microsoft.PowerShell_profile.ps1"
Link "$dotfiles\nvim\.config\nvim"                   "$env:LOCALAPPDATA\nvim"
Link "$dotfiles\lazygit\.config\lazygit\config.yml"  "$env:LOCALAPPDATA\lazygit\config.yml"

# ---------------------------------------------------------------------------
# repos
# ---------------------------------------------------------------------------
New-Item -ItemType Directory -Force "$HOME\repos" | Out-Null
if (-not (Test-Path "$HOME\repos\shift")) {
  git clone --recurse-submodules https://github.com/shift-editor/shift.git "$HOME\repos\shift"
}

Write-Host @'

Done. Remaining manual steps:
  - tailscale up          (log in to the tailnet)
  - set a password for this account (RDP refuses blank passwords)
  - reboot                (applies the hostname)
'@ -ForegroundColor Green

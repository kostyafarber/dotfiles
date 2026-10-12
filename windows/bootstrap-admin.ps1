# Machine-level setup for the Windows dev box. Needs an elevated shell;
# windows\bootstrap.ps1 launches it and then does the per-user half.

#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
Start-Transcript "$env:LOCALAPPDATA\dotfiles\bootstrap-admin.log" -Force | Out-Null

$hostName = 'windows'
# Tailscale's CGNAT range. SSH and RDP accept connections only from the tailnet.
$tailnet = '100.64.0.0/10'

# ---------------------------------------------------------------------------
# packages — Windows equivalents of common.nix home.packages + workstation casks
# ---------------------------------------------------------------------------
$packages = @(
  # core
  'Git.Git'
  'GitHub.cli'
  'Microsoft.PowerShell'
  'Microsoft.VCRedist.2015+.x64'  # delta and other MSVC-built tools need vcruntime140.dll
  'Tailscale.Tailscale'

  # cli tools
  'BurntSushi.ripgrep.MSVC'
  'sharkdp.fd'
  'sharkdp.bat'
  'eza-community.eza'
  'jqlang.jq'
  'junegunn.fzf'
  'ajeetdsouza.zoxide'
  'dandavison.delta'
  'JesseDuffield.lazygit'
  'Neovim.Neovim'
  'JanDeDobbeleer.OhMyPosh'
  'Fastfetch-cli.Fastfetch'
  'ezwinports.make'

  # languages — Shift needs Rust (MSVC), Node 24 + pnpm, and Python for scripts/
  'Rustlang.Rustup'
  'Schniz.fnm'  # reads .nvmrc, like nvm on the Macs
  'Python.Python.3.13'
  'astral-sh.uv'

  # apps
  'AgileBits.1Password'
  'AgileBits.1Password.CLI'
  'Google.Chrome'
  'Microsoft.PowerToys'
  'Obsidian.Obsidian'
  'Discord.Discord'
)

foreach ($id in $packages) {
  Write-Host "==> $id" -ForegroundColor Cyan
  winget install --id $id -e --disable-interactivity --accept-source-agreements --accept-package-agreements
}

# MSVC linker + Windows SDK for Rust's x86_64-pc-windows-msvc target.
# Its pre-check cancels if any other MSI is still finishing, so wait for the
# Windows Installer mutex to be free first.
Write-Host '==> Visual Studio Build Tools (C++)' -ForegroundColor Cyan
$msi = $null
while ([Threading.Mutex]::TryOpenExisting('Global\_MSIExecute', [ref]$msi)) {
  $msi.Dispose()
  Start-Sleep 10
}
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --disable-interactivity --accept-source-agreements --accept-package-agreements `
  --override '--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'

# ---------------------------------------------------------------------------
# system settings
# ---------------------------------------------------------------------------
# Developer Mode: lets git and the dotfiles links create symlinks without admin
New-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name AllowDevelopmentWithoutDevLicense -Value 1 -PropertyType DWord -Force | Out-Null
# node_modules and cargo target dirs blow past MAX_PATH
New-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWord -Force | Out-Null

# Always-on box: never sleep or hibernate on AC power
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

# ---------------------------------------------------------------------------
# OpenSSH server — key-only, PowerShell 7, tailnet-only
# ---------------------------------------------------------------------------
if ((Get-WindowsCapability -Online -Name 'OpenSSH.Server*').State -ne 'Installed') {
  Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' | Out-Null
}
Set-Service sshd -StartupType Automatic
Start-Service sshd  # first start generates host keys and sshd_config

$pwsh = 'C:\Program Files\PowerShell\7\pwsh.exe'
New-ItemProperty 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value $pwsh -PropertyType String -Force | Out-Null

# Members of Administrators read keys from here, not ~/.ssh/authorized_keys
$authKeys = "$env:ProgramData\ssh\administrators_authorized_keys"
(Invoke-WebRequest 'https://github.com/kostyafarber.keys' -UseBasicParsing).Content | Set-Content $authKeys -Encoding ascii
icacls $authKeys /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null

$sshdConfig = "$env:ProgramData\ssh\sshd_config"
$config = Get-Content $sshdConfig
if ($config -notmatch '^PasswordAuthentication no') {
  $config = $config -replace '^#?PasswordAuthentication .*', 'PasswordAuthentication no'
  $config | Set-Content $sshdConfig -Encoding ascii
}
Restart-Service sshd

Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (Tailscale)' `
  -Direction Inbound -Protocol TCP -LocalPort 22 -RemoteAddress $tailnet -Action Allow | Out-Null

# ---------------------------------------------------------------------------
# Remote Desktop — NLA on, tailnet-only
# ---------------------------------------------------------------------------
Set-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value 0
Set-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -Name UserAuthentication -Value 1
# "@FirewallAPI.dll,-28752" is the Remote Desktop rule group, independent of display language
Get-NetFirewallRule -Group '@FirewallAPI.dll,-28752' | Set-NetFirewallRule -Enabled True -RemoteAddress $tailnet

# ---------------------------------------------------------------------------
# hostname — takes effect after reboot
# ---------------------------------------------------------------------------
if ($env:COMPUTERNAME -ne $hostName) {
  Rename-Computer -NewName $hostName -Force
  Write-Host "Renamed to '$hostName'; reboot to apply." -ForegroundColor Yellow
}

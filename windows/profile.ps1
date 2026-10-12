# PowerShell 7 profile — linked to $PROFILE by windows/bootstrap.ps1.

$env:EDITOR = 'nvim'
$env:VISUAL = 'nvim'

# node — switches version on cd according to .nvmrc / .node-version
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression

# directory jumping, like programs.zoxide
zoxide init powershell | Out-String | Invoke-Expression

# prompt, like programs.oh-my-posh
oh-my-posh init pwsh --config agnoster | Invoke-Expression

Remove-Item Alias:ls -ErrorAction SilentlyContinue
function ls { eza --group-directories-first @args }
function ll { eza -la --group-directories-first @args }
function lg { lazygit @args }
function vim { nvim @args }

# ~/.pslocal.ps1 - the zshlocal idea for PowerShell.
# Works in Windows PowerShell 5.1 and PowerShell 7+, on Windows, macOS and Linux.
# This file is plain ASCII on purpose: Windows PowerShell 5.1 reads a script without a
# byte-order mark in the system code page, which would mangle any other character.
#
# Install (run in PowerShell):
#   iwr https://raw.githubusercontent.com/blaineam/blaineam.github.io/main/dotfiles/profile.ps1 -OutFile "$HOME/.pslocal.ps1" -UseBasicParsing; if (!(Test-Path $PROFILE)) { New-Item -Force -ItemType File $PROFILE | Out-Null }; Add-Content $PROFILE '. "$HOME/.pslocal.ps1"'; . "$HOME/.pslocal.ps1"
# Update:
#   iwr https://raw.githubusercontent.com/blaineam/blaineam.github.io/main/dotfiles/profile.ps1 -OutFile "$HOME/.pslocal.ps1" -UseBasicParsing; . "$HOME/.pslocal.ps1"
# If Windows says running scripts is disabled, this is the one command you need (it is
# per-user, needs no admin rights, and this file never runs it for you):
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#
# What it does:
#   - a two-line prompt: user@host|dir (git branch)[duration status], then an arrow.
#     The branch is read straight from .git/HEAD, so the prompt never starts a process.
#   - short functions for the zshlocal aliases that make sense here. An existing alias or
#     function is never replaced, so PowerShell's own gc, gl, gp and gcm keep their
#     meaning; the git versions are gcv (commit -v), gcmsg (commit -m), gpull and gpush.
#   - Install-DotfilesTools: installs git, vim, fzf and friends with winget, else scoop,
#     else choco. Loading the profile never installs anything by itself, because Windows
#     installers take minutes and can ask for elevation. To have it run once on the first
#     load, set ZSHLOCAL_AUTOINSTALL=1 before the profile is loaded.
#
# Offline (same names as zshlocal):
#   ZSHLOCAL_OFFLINE=1          never touch the network or a package manager.
#   New-Item ~/.pslocal-offline the same, as a file.
#   ZSHLOCAL_OFFLINE=0          skip the connectivity check.
#   (unset)                     a check of 3 seconds at most decides. When it fails,
#                               installs are skipped, one line says so, and the automatic
#                               install waits a day before looking again
#                               (or at once after: Remove-Item ~/.pslocal-setup-skipped).
#   ZSHLOCAL_PROBE_URL=url      what the check connects to (default: GitHub raw).
#   ZSHLOCAL_BUNDLE=path        honoured only to say no: winget, scoop and choco cannot
#                               install from a bundle offline, so a bundle carries this
#                               file but no Windows packages.

$global:ZlState = @{
    IsWindows  = (($PSVersionTable.PSVersion.Major -lt 6) -or $IsWindows)
    Esc        = [string][char]27
    Dot        = [string][char]0x25CF
    Arrow      = [string][char]0x2192
    UseAnsi    = $false
    LastHistId = -1
    Done       = (Join-Path $HOME '.pslocal-setup-done')
    Skipped    = (Join-Path $HOME '.pslocal-setup-skipped')
    Offline    = (Join-Path $HOME '.pslocal-offline')
}

# ANSI colours need a host that understands escape sequences. Windows PowerShell 5.1 on
# Windows 10+ and every PowerShell 7 do; the ISE and old consoles do not, and get the
# console's named colours instead. NO_COLOR turns colour off altogether.
try {
    if ($Host.Name -ne 'Windows PowerShell ISE Host') {
        $zlVt = $Host.UI.PSObject.Properties['SupportsVirtualTerminal']
        if ($null -ne $zlVt -and $zlVt.Value) { $global:ZlState.UseAnsi = $true }
    }
} catch { $global:ZlState.UseAnsi = $false }
Remove-Variable -Name zlVt -ErrorAction SilentlyContinue

# --- Prompt ---

function global:Get-ZlGitBranch {
    # Walk up from the current directory to a .git, then read HEAD. No git process.
    try {
        if ($PWD.Provider.Name -ne 'FileSystem') { return '' }
        $dir = $PWD.ProviderPath
        while ($dir) {
            $dotGit = Join-Path $dir '.git'
            if (Test-Path -LiteralPath $dotGit) {
                $gitDir = $dotGit
                if (Test-Path -LiteralPath $dotGit -PathType Leaf) {
                    # A worktree or submodule: .git is a file saying "gitdir: <path>".
                    $line = Get-Content -LiteralPath $dotGit -TotalCount 1
                    if ($line -notmatch '^gitdir:\s*(.+)$') { return '' }
                    $gitDir = $Matches[1].Trim()
                    if (-not [System.IO.Path]::IsPathRooted($gitDir)) { $gitDir = Join-Path $dir $gitDir }
                }
                $headFile = Join-Path $gitDir 'HEAD'
                if (-not (Test-Path -LiteralPath $headFile)) { return '' }
                $head = Get-Content -LiteralPath $headFile -TotalCount 1
                if ($head -match '^ref:\s*refs/heads/(.+)$') { return $Matches[1].Trim() }
                return ''
            }
            $parent = Split-Path -Path $dir -Parent
            if (-not $parent -or $parent -eq $dir) { break }
            $dir = $parent
        }
    } catch { }
    return ''
}

function global:Format-ZlDuration {
    param([double]$Seconds)
    $secs = [int][math]::Floor($Seconds)
    if ($secs -le 0) { return '' }
    $h = [int][math]::Floor($secs / 3600)
    $m = [int][math]::Floor(($secs % 3600) / 60)
    $s = $secs % 60
    $out = ''
    if ($h -gt 0) { $out += "${h}h" }
    if ($m -gt 0) { $out += "${m}m" }
    if ($s -gt 0) { $out += "${s}s" }
    return $out
}

function global:prompt {
    $ok = $?
    $lastExit = Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
    $lastExitValue = $null
    if ($null -ne $lastExit) { $lastExitValue = $lastExit.Value }
    $st = $global:ZlState

    $dir = "$PWD"
    try {
        if ($PWD.Provider.Name -eq 'FileSystem') {
            $dir = $PWD.ProviderPath
            if ($dir -eq $HOME) { $dir = '~' }
            elseif ($dir.StartsWith($HOME + [System.IO.Path]::DirectorySeparatorChar)) { $dir = '~' + $dir.Substring($HOME.Length) }
        }
    } catch { }

    # Duration of the command that just ran (not shown again when you only press Enter).
    $duration = ''
    $fresh = $false
    try {
        $hist = Get-History -Count 1
        if ($null -ne $hist) {
            if ($hist.Id -ne $st.LastHistId) {
                $fresh = $true
                $st.LastHistId = $hist.Id
                $duration = Format-ZlDuration (($hist.EndExecutionTime - $hist.StartExecutionTime).TotalSeconds)
            }
        }
    } catch { }

    $branch = Get-ZlGitBranch

    # Text and colour, as: ANSI code, console colour name. No yellow anywhere.
    $seg = New-Object System.Collections.ArrayList
    [void]$seg.Add(@([Environment]::UserName, '36', 'Cyan'))
    [void]$seg.Add(@('@', '31', 'Red'))
    [void]$seg.Add(@([Environment]::MachineName, '38;5;141', 'Blue'))
    [void]$seg.Add(@('|', '31', 'Red'))
    [void]$seg.Add(@($dir, '32', 'Green'))
    if ($branch) {
        [void]$seg.Add(@(' (', '31', 'Red'))
        [void]$seg.Add(@($branch, '38;5;206', 'Magenta'))
        [void]$seg.Add(@(')', '31', 'Red'))
    }
    if ($fresh -or $st.LastHistId -ge 0) {
        [void]$seg.Add(@('[', '31', 'Red'))
        if ($duration) { [void]$seg.Add(@($duration, '35', 'Magenta')) }
        if ($ok) { [void]$seg.Add(@($st.Dot, '32', 'Green')) } else { [void]$seg.Add(@($st.Dot, '31', 'Red')) }
        [void]$seg.Add(@(']', '31', 'Red'))
    }

    if ($null -ne $lastExit) { $global:LASTEXITCODE = $lastExitValue }

    if ($env:NO_COLOR) {
        $line = ''
        foreach ($p in $seg) { $line += $p[0] }
        return "$line`n$($st.Arrow) "
    }
    if ($st.UseAnsi) {
        $e = $st.Esc
        $line = ''
        foreach ($p in $seg) { $line += "$e[$($p[1])m$($p[0])" }
        return "$line$e[0m`n$e[35m$($st.Arrow)$e[0m "
    }
    foreach ($p in $seg) { Write-Host -NoNewline -ForegroundColor $p[2] $p[0] }
    Write-Host ''
    Write-Host -NoNewline -ForegroundColor Magenta $st.Arrow
    return ' '
}

# --- Aliases, as functions (a PowerShell alias cannot carry arguments) ---

function global:Test-ZlCommand {
    # True when the name is already an alias or a function. Those are the two things that
    # would win over (or be) what this file defines; a program of the same name on the
    # PATH is fine, a function simply comes first.
    param([string]$Name)
    return ($null -ne $ExecutionContext.InvokeCommand.GetCommand($Name, 'Alias,Function'))
}

function global:Set-ZlFunction {
    # Define a global function unless the name is already taken.
    param([string]$Name, [scriptblock]$Body)
    if (Test-ZlCommand $Name) { return }
    Set-Item -LiteralPath "function:global:$Name" -Value $Body
}

Set-ZlFunction 'll'  { Get-ChildItem @args }
Set-ZlFunction 'la'  { Get-ChildItem -Force @args }
Set-ZlFunction 'c'   { Clear-Host }
Set-ZlFunction '..'  { Set-Location .. }
Set-ZlFunction '...' { Set-Location ../.. }
if ($global:ZlState.IsWindows) {
    # macOS and Linux have these as real programs.
    Set-ZlFunction 'which' { Get-Command @args | Select-Object -ExpandProperty Definition }
    Set-ZlFunction 'open'  { if ($args.Count -eq 0) { Invoke-Item . } else { Invoke-Item @args } }
    Set-ZlFunction 'touch' {
        foreach ($f in $args) {
            if (Test-Path -LiteralPath $f) { (Get-Item -LiteralPath $f).LastWriteTime = Get-Date }
            else { New-Item -ItemType File -Path $f | Out-Null }
        }
    }
}

# Tool shortcuts
Set-ZlFunction 'g' { git @args }
Set-ZlFunction 'v' { vim @args }

# Git. gc, gl, gp and gcm are PowerShell's own (Get-Content, Get-Location,
# Get-ItemProperty, Get-Command) and are left alone.
Set-ZlFunction 'ga'    { git add @args }
Set-ZlFunction 'gs'    { git status @args }
Set-ZlFunction 'gd'    { git diff @args }
Set-ZlFunction 'gcv'   { git commit -v @args }
Set-ZlFunction 'gcmsg' { git commit -m @args }
Set-ZlFunction 'gpull' { git pull @args }
Set-ZlFunction 'gpush' { git push -u origin HEAD @args }
Set-ZlFunction 'gb'    { git branch @args }
Set-ZlFunction 'gba'   { git branch -a @args }
Set-ZlFunction 'gco'   { git checkout @args }

# --- Optional tool installs ---

function global:Test-ZlOnline {
    # A TCP connection with a hard 3 second limit. Name lookup is inside the limit too.
    $target = 'https://raw.githubusercontent.com/'
    if ($env:ZSHLOCAL_PROBE_URL) { $target = $env:ZSHLOCAL_PROBE_URL }
    $client = $null
    try {
        $uri = [Uri]$target
        $client = New-Object System.Net.Sockets.TcpClient
        $pending = $client.BeginConnect($uri.Host, $uri.Port, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(3000, $false)) { return $false }
        $client.EndConnect($pending)
        return $client.Connected
    } catch {
        return $false
    } finally {
        if ($null -ne $client) { $client.Close() }
    }
}

function global:Write-ZlSkip {
    # One line saying what was skipped, at most once a day, and remember it.
    param([string]$Message)
    $marker = $global:ZlState.Skipped
    $recent = $false
    try {
        if (Test-Path -LiteralPath $marker) {
            $recent = ((Get-Date) - (Get-Item -LiteralPath $marker -Force).LastWriteTime).TotalHours -lt 24
        }
    } catch { }
    if (-not $recent) {
        Write-Host "pslocal: $Message The prompt and aliases are still set up."
        try { Set-Content -LiteralPath $marker -Value '' } catch { }
    }
}

function global:Install-DotfilesTools {
    <#
    .SYNOPSIS
    Install git, vim, fzf, ffmpeg, ImageMagick and rclone with winget, scoop or choco.
    .DESCRIPTION
    Uses the first of winget, scoop and choco that exists; does nothing, without an error,
    when none does. Tools that are already on the PATH are left alone. A package that
    cannot be installed is named and skipped. -Auto is what the profile uses when
    ZSHLOCAL_AUTOINSTALL=1: it is quiet for a day after a failed connectivity check.
    #>
    param([switch]$Auto)
    $st = $global:ZlState
    try {
        if (-not $st.IsWindows) {
            if (-not $Auto) { Write-Host 'pslocal: on macOS and Linux use zshlocal for tool installs; nothing installed.' }
            return
        }

        if ($env:ZSHLOCAL_BUNDLE) {
            Write-ZlSkip 'ZSHLOCAL_BUNDLE is set, but winget, scoop and choco cannot install from a bundle offline, so no tools were installed.'
            return
        }

        $offline = $env:ZSHLOCAL_OFFLINE
        if (-not $offline -and (Test-Path -LiteralPath $st.Offline)) { $offline = '1' }
        if ($offline -eq '1' -or $offline -eq 'true' -or $offline -eq 'yes') {
            Write-ZlSkip 'offline mode is on (ZSHLOCAL_OFFLINE=1 or ~/.pslocal-offline), skipped tool installs.'
            return
        }

        # Name on the PATH, then the id for winget, scoop and choco.
        $tools = @(
            @('git',    'Git.Git',                 'git',         'git'),
            @('vim',    'vim.vim',                 'vim',         'vim'),
            @('fzf',    'junegunn.fzf',            'fzf',         'fzf'),
            @('ffmpeg', 'Gyan.FFmpeg',             'ffmpeg',      'ffmpeg'),
            @('magick', 'ImageMagick.ImageMagick', 'imagemagick', 'imagemagick'),
            @('rclone', 'Rclone.Rclone',           'rclone',      'rclone')
        )
        $missing = @($tools | Where-Object { -not (Get-Command -Name $_[0] -CommandType Application -ErrorAction SilentlyContinue) })
        if ($missing.Count -eq 0) {
            if (-not $Auto) { Write-Host 'pslocal: every tool is already installed.' }
            Set-Content -LiteralPath $st.Done -Value ''
            return
        }

        $manager = $null
        foreach ($m in 'winget', 'scoop', 'choco') {
            if (Get-Command -Name $m -ErrorAction SilentlyContinue) { $manager = $m; break }
        }
        if (-not $manager) {
            Write-ZlSkip 'no winget, scoop or choco found, skipped tool installs.'
            return
        }

        if ($offline -ne '0' -and $offline -ne 'false' -and $offline -ne 'no') {
            if ($Auto -and (Test-Path -LiteralPath $st.Skipped)) {
                if (((Get-Date) - (Get-Item -LiteralPath $st.Skipped -Force).LastWriteTime).TotalHours -lt 24) { return }
            }
            if (-not (Test-ZlOnline)) {
                Write-ZlSkip 'no network, skipped tool installs (the automatic install retries in a day; ZSHLOCAL_OFFLINE=0 skips this check).'
                return
            }
        }

        $failed = @()
        foreach ($t in $missing) {
            Write-Host "Installing $($t[0]) with $manager..."
            switch ($manager) {
                'winget' { & winget install --id $t[1] --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null }
                'scoop'  { & scoop install $t[2] | Out-Null }
                'choco'  { & choco install $t[3] -y --no-progress | Out-Null }
            }
            $code = Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
            if ($null -ne $code -and $code.Value -ne 0) { $failed += $t[0] }
        }
        if ($failed.Count -gt 0) {
            Write-Host "pslocal: not installed: $($failed -join ', ') (not found, declined, or needs an elevated shell; choco usually does)."
        }
        Remove-Item -LiteralPath $st.Skipped -Force -ErrorAction SilentlyContinue
        Set-Content -LiteralPath $st.Done -Value ''
        Write-Host 'Shell setup complete! Open a new window so the new tools are on the PATH.'
    } catch {
        Write-Host "pslocal: tool install stopped: $($_.Exception.Message)"
    }
}

# Only when asked for, and only once: installing is never a side effect of opening a shell.
try {
    if ($env:ZSHLOCAL_AUTOINSTALL -eq '1' -and $global:ZlState.IsWindows -and -not (Test-Path -LiteralPath $global:ZlState.Done)) {
        Install-DotfilesTools -Auto
    }
} catch { }

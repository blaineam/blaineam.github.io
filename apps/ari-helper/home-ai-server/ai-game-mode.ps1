<#
  ai-game-mode.ps1 - shares one graphics card between your games and your AI servers.

  Runs quietly in the background. The moment a game starts, it stops Ollama,
  ComfyUI and LocalAI so the game gets all of the video memory. When the last
  game exits, it starts them again, so Ari can use the PC right away.

  Install once (runs at every sign-in, hidden):
      powershell -ExecutionPolicy Bypass -File .\ai-game-mode.ps1 -Install

  Other commands:
      -Uninstall   remove the background task
      -Pause       free the GPU now (stop the AI servers)
      -Resume      start the AI servers now
      -Status      show what's running and which game, if any
      -Watch       run the watcher in this window (what the task runs)

  A game is any program running from a game library folder: Steam, Epic, GOG,
  Xbox (XboxGames), EA, Ubisoft, Riot and Blizzard game locations are found
  automatically. Add others to $ExtraGames, and put anything that should never
  pause the AI in $IgnoreGames. The log says which program triggered a pause:
      %LOCALAPPDATA%\AIGameMode\ai-game-mode.log

  Guide: https://wemiller.com/apps/ari-helper/home-ai-server/
#>
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Pause,
    [switch]$Resume,
    [switch]$Status,
    [switch]$Watch
)

# ---------------------------------------------------------------- settings --

# What to do when a game starts:
#   'Stop'   stop the AI servers entirely (frees every byte; Ari can't reach
#            them until the game exits)
#   'Unload' keep them answering but drop every loaded model (Ari can still
#            ask, which loads a model again and competes with the game)
$PauseMode = 'Stop'

# Which servers this script looks after. Set any to $false to leave it alone.
$ManageOllama  = $true
$ManageComfyUI = $true
$ManageLocalAI = $true

# ComfyUI runs inside the Comfy Desktop app. Turn on "Auto start" for your
# build there, so that opening the app starts ComfyUI again. The script finds
# the app by itself; set the full path to "Comfy Desktop.exe" only if -Status
# says it can't.
$ComfyDesktopExe = ''
$ComfyUIPort     = 8188

# Docker container name used for LocalAI.
$LocalAIContainer = 'local-ai'

# How often to look for games, and how long to wait after the last game exits
# before starting the AI again (covers games that restart themselves).
$PollSeconds   = 1
$ResumeSeconds = 3

# Extra game programs (file names) that aren't in a known library folder.
$ExtraGames = @(
    # 'MyGame.exe'
)

# Programs or folders that live in a game library but are not games.
$IgnoreGames = @(
    'wallpaper32.exe', 'wallpaper64.exe', 'webwallpaper32.exe', 'wallpaper_engine',
    'Steamworks Shared', 'UnityCrashHandler64.exe', 'UnityCrashHandler32.exe',
    'CrashReportClient.exe', 'CrashpadHandler.exe', 'crashpad_handler.exe',
    'EpicWebHelper.exe', 'EpicGamesLauncher.exe', 'EpicOnlineServicesHost.exe',
    'EasyAntiCheat.exe', 'EasyAntiCheat_EOS.exe', 'BEService.exe', 'BEService_x64.exe',
    'Lossless Scaling', 'LosslessScaling.exe', 'Riot Client', 'RiotClientServices.exe', 'vgtray.exe'
)

# ------------------------------------------------------------------ plumbing --

$TaskName = 'AI Game Mode'
$StateDir = Join-Path $env:LOCALAPPDATA 'AIGameMode'
$LogPath  = Join-Path $StateDir 'ai-game-mode.log'
$ComfyExeFile = Join-Path $StateDir 'comfy-desktop-path.txt'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Write-Log([string]$Message) {
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message
    Write-Host $line
    try {
        if ((Test-Path $LogPath) -and (Get-Item $LogPath).Length -gt 1MB) {
            Move-Item -Force $LogPath "$LogPath.old"
        }
        Add-Content -Path $LogPath -Value $line
    } catch { }
}

function Get-GameFolders {
    $folders = New-Object System.Collections.Generic.List[string]

    # Steam: every library listed in libraryfolders.vdf.
    $steam = $null
    try { $steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction Stop).SteamPath } catch { }
    if (-not $steam) { $steam = "${env:ProgramFiles(x86)}\Steam" }
    $steam = $steam -replace '/', '\'
    $folders.Add((Join-Path $steam 'steamapps\common'))
    $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
        foreach ($m in [regex]::Matches((Get-Content -Raw $vdf), '"path"\s+"([^"]+)"')) {
            $folders.Add((Join-Path ($m.Groups[1].Value -replace '\\\\', '\') 'steamapps\common'))
        }
    }

    # Epic: each installed game's own folder.
    $epic = "$env:ProgramData\Epic\EpicGamesLauncher\Data\Manifests"
    if (Test-Path $epic) {
        foreach ($item in Get-ChildItem $epic -Filter *.item -ErrorAction SilentlyContinue) {
            try {
                $loc = (Get-Content -Raw $item.FullName | ConvertFrom-Json).InstallLocation
                if ($loc) { $folders.Add($loc) }
            } catch { }
        }
    }

    # Common defaults, on every fixed drive.
    $relative = @(
        'Program Files\Epic Games', 'Program Files (x86)\GOG Galaxy\Games', 'GOG Games',
        'XboxGames', 'Program Files\EA Games', 'Program Files (x86)\Origin Games',
        'Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games', 'Program Files\Ubisoft\Ubisoft Connect\games',
        'Program Files (x86)\Call of Duty', 'Program Files (x86)\Overwatch',
        'Program Files (x86)\World of Warcraft', 'Program Files (x86)\Diablo IV', 'Program Files\Riot Games',
        'Riot Games'
    )
    foreach ($drive in [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady }) {
        foreach ($r in $relative) { $folders.Add((Join-Path $drive.RootDirectory.FullName $r)) }
    }

    $folders | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object { $_.TrimEnd('\') + '\' } | Sort-Object -Unique
}

function Test-Ignored([string]$Path, [string]$Name) {
    foreach ($i in $IgnoreGames) {
        if ($Name -ieq $i) { return $true }
        if ($Path -and $Path.IndexOf("\$i\", [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    return $false
}

# Reading a process's path is the slow part, so remember it per process id.
$script:PathCache = @{}

function Find-RunningGame([string[]]$Folders) {
    $procs = @(Get-Process -ErrorAction SilentlyContinue)
    $alive = @{}
    foreach ($p in $procs) { $alive[$p.Id] = $true }
    foreach ($id in @($script:PathCache.Keys)) { if (-not $alive.ContainsKey($id)) { $script:PathCache.Remove($id) } }

    foreach ($p in $procs) {
        $key = $p.Id
        if ($script:PathCache.ContainsKey($key) -and $script:PathCache[$key].Name -eq $p.ProcessName) {
            $path = $script:PathCache[$key].Path
        } else {
            $path = $null
            try { $path = $p.Path } catch { }
            $script:PathCache[$key] = @{ Name = $p.ProcessName; Path = $path }
        }
        $exe = if ($path) { Split-Path -Leaf $path } else { "$($p.ProcessName).exe" }
        if (Test-Ignored $path $exe) { continue }
        foreach ($e in $ExtraGames) { if ($exe -ieq $e) { return $p } }
        if (-not $path) { continue }
        foreach ($f in $Folders) {
            if ($path.StartsWith($f, [StringComparison]::OrdinalIgnoreCase)) { return $p }
        }
    }
    return $null
}

# -------------------------------------------------------------- the servers --

function Test-Port([int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $ok = $client.ConnectAsync('127.0.0.1', $Port).Wait(300)
        $client.Close()
        return $ok
    } catch { return $false }
}

function Get-ComfyProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*ComfyUI*main.py*' }
}

function Get-ComfyDesktopProcesses { @(Get-Process -Name 'Comfy Desktop' -ErrorAction SilentlyContinue) }

# While the app is open, remember where it lives: that's how it gets reopened.
function Save-ComfyDesktopPath($Processes) {
    foreach ($p in $Processes) {
        $path = $null
        try { $path = $p.Path } catch { }
        if ($path) { Set-Content -Path $ComfyExeFile -Value $path; return }
    }
}

function Find-ComfyDesktop {
    $candidates = @($ComfyDesktopExe)
    if (Test-Path $ComfyExeFile) { $candidates += (Get-Content $ComfyExeFile -TotalCount 1) }
    foreach ($root in @("$env:LOCALAPPDATA\Programs", $env:ProgramFiles)) {
        if ($root) { $candidates += "$root\Comfy Desktop\Comfy Desktop.exe" }
    }
    foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
    # Last resort: whatever the Start menu shortcut points at.
    foreach ($menu in @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")) {
        $link = Get-ChildItem $menu -Recurse -Filter 'Comfy Desktop.lnk' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($link) {
            $target = (New-Object -ComObject WScript.Shell).CreateShortcut($link.FullName).TargetPath
            if ($target -and (Test-Path $target)) { return $target }
        }
    }
    return $null
}

function Test-Docker { [bool](Get-Command docker -ErrorAction SilentlyContinue) }

function Stop-AI {
    if ($ManageComfyUI) {
        if ($PauseMode -eq 'Unload') {
            try {
                Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$ComfyUIPort/interrupt" -TimeoutSec 3 | Out-Null
                Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$ComfyUIPort/free" -ContentType 'application/json' `
                    -Body '{"unload_models":true,"free_memory":true}' -TimeoutSec 5 | Out-Null
                Write-Log '  ComfyUI: models unloaded'
            } catch { }
        } else {
            # The app first, so it doesn't report its ComfyUI as crashed,
            # then any ComfyUI process still holding video memory.
            $app = @(Get-ComfyDesktopProcesses)
            if ($app.Count) {
                Save-ComfyDesktopPath $app
                $app | Stop-Process -Force -ErrorAction SilentlyContinue
            }
            $procs = @(Get-ComfyProcesses)
            foreach ($c in $procs) { Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue }
            if ($app.Count -or $procs.Count) { Write-Log '  ComfyUI: stopped (Comfy Desktop closed)' }
        }
    }
    if ($ManageOllama) {
        if ($PauseMode -eq 'Unload') {
            try {
                $loaded = (Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/ps' -TimeoutSec 3).models
                foreach ($m in $loaded) {
                    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:11434/api/generate' -ContentType 'application/json' `
                        -Body (@{ model = $m.name; keep_alive = 0 } | ConvertTo-Json) -TimeoutSec 10 | Out-Null
                }
                Write-Log "  Ollama: $(@($loaded).Count) model(s) unloaded"
            } catch { }
        } else {
            $procs = @(Get-Process -Name 'ollama app', 'ollama' -ErrorAction SilentlyContinue)
            $procs | Stop-Process -Force -ErrorAction SilentlyContinue
            if ($procs.Count) { Write-Log '  Ollama: stopped' }
        }
    }
    if ($ManageLocalAI -and (Test-Docker)) {
        $running = (& docker ps -q --filter "name=^$LocalAIContainer$" 2>$null)
        if ($running) {
            if ($PauseMode -eq 'Unload') {
                & docker restart $LocalAIContainer 2>$null | Out-Null
                Write-Log '  LocalAI: restarted (models unloaded)'
            } else {
                & docker stop $LocalAIContainer 2>$null | Out-Null
                Write-Log '  LocalAI: stopped'
            }
        }
    }
}

function Start-AI {
    if ($ManageOllama -and -not (Get-Process -Name 'ollama app', 'ollama' -ErrorAction SilentlyContinue)) {
        $app = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama app.exe'
        if (Test-Path $app) {
            Start-Process -FilePath $app
            Write-Log '  Ollama: started'
        } elseif (Get-Command ollama -ErrorAction SilentlyContinue) {
            Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
            Write-Log '  Ollama: started (ollama serve)'
        }
    }
    if ($ManageComfyUI) {
        $open = @(Get-ComfyDesktopProcesses)
        if ($open.Count) {
            Save-ComfyDesktopPath $open
        } elseif (-not (Test-Port $ComfyUIPort)) {
            $exe = Find-ComfyDesktop
            if ($exe) {
                Start-Process -FilePath $exe -WindowStyle Minimized
                Write-Log '  ComfyUI: opened Comfy Desktop'
            } else {
                Write-Log '  ComfyUI: Comfy Desktop not found (open it once, or set $ComfyDesktopExe at the top of this script)'
            }
        }
    }
    if ($ManageLocalAI -and (Test-Docker)) {
        $exists = (& docker ps -aq --filter "name=^$LocalAIContainer$" 2>$null)
        $running = (& docker ps -q --filter "name=^$LocalAIContainer$" 2>$null)
        if ($exists -and -not $running) {
            & docker start $LocalAIContainer 2>$null | Out-Null
            Write-Log '  LocalAI: started'
        }
    }
}

function Show-Status {
    $folders = @(Get-GameFolders)
    $game = Find-RunningGame $folders
    Write-Host ("Game running : {0}" -f $(if ($game) { "$($game.ProcessName) ($($game.Path))" } else { 'none' }))
    Write-Host ("Ollama       : {0}" -f $(if (Test-Port 11434) { 'serving on 127.0.0.1:11434' } else { 'stopped' }))
    Write-Host ("ComfyUI      : {0}" -f $(if (Test-Port $ComfyUIPort) { "serving on 127.0.0.1:$ComfyUIPort" } else { 'stopped' }))
    $open = @(Get-ComfyDesktopProcesses)
    if ($open.Count) { Save-ComfyDesktopPath $open }
    $comfyApp = Find-ComfyDesktop
    Write-Host ("Comfy app    : {0}" -f $(if ($comfyApp) { $comfyApp } else { 'not found (open Comfy Desktop, then run -Status again)' }))
    Write-Host ("LocalAI      : {0}" -f $(if (Test-Port 8080) { 'serving on 127.0.0.1:8080' } else { 'stopped' }))
    Write-Host ("Task         : {0}" -f $(if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { 'installed' } else { 'not installed' }))
    Write-Host 'Game folders :'
    $folders | ForEach-Object { Write-Host "  $_" }
}

function Invoke-Watcher {
    Write-Log "Watching for games (mode: $PauseMode)"
    $folders = @(Get-GameFolders)
    $foldersAt = Get-Date
    $paused = $false
    $lastGameAt = [datetime]::MinValue

    # A game already running when we start counts too.
    if (-not (Find-RunningGame $folders)) { Start-AI }

    while ($true) {
        # Pick up newly added libraries and installs every few minutes.
        if (((Get-Date) - $foldersAt).TotalMinutes -ge 5) { $folders = @(Get-GameFolders); $foldersAt = Get-Date }

        $game = Find-RunningGame $folders
        if ($game) {
            $lastGameAt = Get-Date
            if (-not $paused) {
                Write-Log "Game started: $($game.ProcessName)  ($($game.Path)) - freeing the GPU"
                Stop-AI
                $paused = $true
            }
        } elseif ($paused -and ((Get-Date) - $lastGameAt).TotalSeconds -ge $ResumeSeconds) {
            Write-Log 'No game running - starting the AI servers'
            Start-AI
            $paused = $false
        }
        Start-Sleep -Seconds $PollSeconds
    }
}

function Install-Task {
    $running = @(Get-ComfyDesktopProcesses)
    if ($running.Count) { Save-ComfyDesktopPath $running }
    $script = $PSCommandPath
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Watch"
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
        -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'Frees the GPU for games and restarts the AI servers when they exit.' -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Installed '$TaskName'. It runs at every sign-in and is running now."
    Write-Host "Log: $LogPath"
}

if ($Install)   { Install-Task; return }
if ($Uninstall) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue; Write-Host "Removed '$TaskName'."; return }
if ($Pause)     { Write-Log 'Paused by hand'; Stop-AI; return }
if ($Resume)    { Write-Log 'Resumed by hand'; Start-AI; return }
if ($Status)    { Show-Status; return }
if ($Watch)     { Invoke-Watcher; return }
Get-Help $PSCommandPath

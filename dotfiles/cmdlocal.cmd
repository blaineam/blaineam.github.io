@echo off
rem cmdlocal.cmd - the zshlocal idea for Command Prompt (cmd.exe): a coloured two-line
rem prompt and doskey macros for the aliases. It installs nothing and writes nothing.
rem
rem Install, in Command Prompt on Windows 10 or later: save this file as
rem   %USERPROFILE%\cmdlocal.cmd
rem and register it to run when cmd starts (one line):
rem   reg add "HKCU\Software\Microsoft\Command Processor" /v AutoRun /t REG_SZ /d "\"%USERPROFILE%\cmdlocal.cmd\"" /f
rem The copyable one-liner that does both is on https://wemiller.com/dotfiles/
rem Undo:
rem   reg delete "HKCU\Software\Microsoft\Command Processor" /v AutoRun /f
rem
rem AutoRun holds ONE command line, and "reg add ... /f" replaces whatever is there. Look
rem first:  reg query "HKCU\Software\Microsoft\Command Processor" /v AutoRun
rem If something is already registered (Clink registers itself there), keep it and join
rem the two with an ampersand instead of replacing it.
rem
rem What cmd cannot do: PROMPT has codes for the path, date, time and a few symbols, and
rem nothing else. It cannot show the exit code of the last command or a git branch,
rem because it cannot run anything while drawing the prompt. So this prompt is
rem user@host, a bar, the path, and an arrow. Type "ec" to see the last exit code.
rem With Clink (https://github.com/chrisant996/clink) installed, a Lua prompt filter can
rem add the branch and the exit code; this file does not depend on Clink.
rem
rem Colour uses ANSI escape sequences, which cmd understands from Windows 10 on. Set
rem NO_COLOR or CMDLOCAL_NOCOLOR to anything for a plain prompt.

rem --- AutoRun runs for EVERY cmd.exe, including the ones that scripts, build tools and
rem "for /f" start. Leave those alone: stop unless this is an interactive shell. A
rem command line with /c or /r runs one command and exits. Delayed expansion is used so
rem that quotes and ampersands inside the command line are never executed.
setlocal EnableDelayedExpansion
set "_cl_run=1"
set "_cl_line=!CMDCMDLINE!"
if not "!_cl_line:/c=!"=="!_cl_line!" set "_cl_run="
if not "!_cl_line:/r=!"=="!_cl_line!" set "_cl_run="
endlocal & set "_CMDLOCAL_RUN=%_cl_run%"
if not defined _CMDLOCAL_RUN exit /b 0
set "_CMDLOCAL_RUN="

rem --- Prompt: user(cyan)@(red)host(violet) bar(red) path(green), new line, arrow(magenta) ---
rem $E escape, $B pipe, $P path, $_ new line, $G greater-than, $S space.
set "PROMPT=$E[36m%USERNAME%$E[31m@$E[38;5;141m%COMPUTERNAME%$E[31m$B$E[32m$P$E[0m$_$E[35m-$G$E[0m$S"
if defined NO_COLOR set "PROMPT=%USERNAME%@%COMPUTERNAME%$B$P$_-$G$S"
if defined CMDLOCAL_NOCOLOR set "PROMPT=%USERNAME%@%COMPUTERNAME%$B$P$_-$G$S"

rem --- Aliases, as doskey macros. They only apply to what you type at the prompt, never
rem inside batch files, so they cannot change what a script does. ---
doskey ll=dir $* >nul 2>&1
doskey la=dir /a $* >nul 2>&1
doskey c=cls >nul 2>&1
doskey clear=cls >nul 2>&1
doskey ..=cd .. >nul 2>&1
doskey ...=cd ..\.. >nul 2>&1
doskey which=where $* >nul 2>&1
doskey open=start "" $* >nul 2>&1
doskey ec=echo %%ERRORLEVEL%% >nul 2>&1

rem Tool shortcuts
doskey g=git $* >nul 2>&1
doskey v=vim $* >nul 2>&1

rem Git aliases
doskey ga=git add $* >nul 2>&1
doskey gs=git status $* >nul 2>&1
doskey gd=git diff $* >nul 2>&1
doskey gc=git commit -v $* >nul 2>&1
doskey gcm=git commit -m $* >nul 2>&1
doskey gl=git pull $* >nul 2>&1
doskey gp=git push -u origin HEAD $* >nul 2>&1
doskey gb=git branch $* >nul 2>&1
doskey gba=git branch -a $* >nul 2>&1
doskey gco=git checkout $* >nul 2>&1

exit /b 0

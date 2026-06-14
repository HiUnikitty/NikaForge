@echo off
cd /d "%~dp0"

echo [NikaForge] Starting check process...

set FIRST_RUN=0
set NEED_INSTALL=0

rem ================= 1. check node_modules
if exist "backend\node_modules\" goto CHECK_GIT
echo [NikaForge] node_modules not found. First run detected.
set FIRST_RUN=1
set NEED_INSTALL=1

rem ================= 2. check git
:CHECK_GIT
if exist ".git\" goto CHECK_GIT_INSTALLED
echo [NikaForge] Not a Git clone. Skipping update check.
goto CHECK_BUN

:CHECK_GIT_INSTALLED
call git --version >nul 2>&1
if %ERRORLEVEL% equ 0 goto CHECK_GIT_UPDATE
echo [NikaForge] Git is not installed. Skipping update check.
goto CHECK_BUN

:CHECK_GIT_UPDATE
echo [NikaForge] Git repository detected. Checking for updates...
call git -c http.sslVerify=false fetch
call git status -uno | findstr /I /C:"Your branch is behind" >nul
if %ERRORLEVEL% equ 0 goto DO_GIT_PULL
echo [NikaForge] Extension is already up to date.
goto CHECK_BUN

:DO_GIT_PULL
echo [NikaForge] New version found! Pulling code...
call git -c http.sslVerify=false pull
echo ========================================================
echo [NikaForge] Update successfully downloaded!
echo Please restart start.bat to apply the latest updates.
echo ========================================================
exit

rem ================= 3. check bun
:CHECK_BUN
call bun --version >nul 2>&1
if %ERRORLEVEL% neq 0 goto INSTALL_BUN
echo [NikaForge] Bun environment is ready.
goto DEPENDENCIES

:INSTALL_BUN
echo [NikaForge] Bun is not installed. Attempting global install...
echo [NikaForge] Cleaning up corrupted Bun directories if any...
if exist "%APPDATA%\npm\node_modules\bun" rd /s /q "%APPDATA%\npm\node_modules\bun"
if exist "%APPDATA%\npm\bun" del /f /q "%APPDATA%\npm\bun"
if exist "%APPDATA%\npm\bun.cmd" del /f /q "%APPDATA%\npm\bun.cmd"

echo [NikaForge] Attempting install via npmmirror registry...
call npm install -g bun --registry=https://registry.npmmirror.com
if %ERRORLEVEL% equ 0 goto BUN_PATH_FIX

echo [NikaForge] npmmirror install failed, trying official npm install...
call npm install -g bun
if %ERRORLEVEL% equ 0 goto BUN_PATH_FIX

:INSTALL_BUN_SCRIPT
echo [NikaForge] Warning: npm install bun failed. Trying official script...
powershell -c "irm bun.sh/install.ps1 | iex"

:BUN_PATH_FIX
set "PATH=%USERPROFILE%\.bun\bin;%APPDATA%\npm;%PATH%"
call bun --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ========================================================
    echo [NikaForge] ERROR: Failed to install Bun environment!
    echo [NikaForge] Bun is mandatory to run NikaForge backend.
    echo [NikaForge] Please try:
    echo 1. Run this script as Administrator.
    echo 2. Download and install Bun manually from https://bun.sh
    echo ========================================================
    pause
    exit /b 1
)


rem ================= 4. install dependencies
:DEPENDENCIES
if %NEED_INSTALL% neq 1 goto CREATE_SHORTCUT

echo [NikaForge] Installing and updating dependencies...
set RETRY_COUNT=0
cd backend

:INSTALL_LOOP
call bun install
if %ERRORLEVEL% equ 0 goto INSTALL_SUCCESS
set /a RETRY_COUNT+=1
if "%RETRY_COUNT%"=="1" goto RETRY_1
if "%RETRY_COUNT%"=="2" goto RETRY_2
goto RETRY_3

:INSTALL_SUCCESS
echo [NikaForge] Dependencies are ready!
cd ..
goto CREATE_SHORTCUT

:RETRY_1
echo [NikaForge] Install failed. Retrying (1/3)...
timeout /t 2 >nul
goto INSTALL_LOOP

:RETRY_2
echo [NikaForge] Install failed. Retrying (2/3)...
timeout /t 2 >nul
goto INSTALL_LOOP

:RETRY_3
echo ========================================================
echo [NikaForge] ERROR: Failed to install dependencies after 3 attempts!
echo [NikaForge] Please check your network connection or proxy settings.
echo [NikaForge] Attempting fallback to domestic npm registry (npmmirror)...
echo ========================================================

call npm install --registry=https://registry.npmmirror.com
if %ERRORLEVEL% neq 0 goto INSTALL_FATAL
echo [NikaForge] Successfully installed using domestic registry!
cd ..
goto CREATE_SHORTCUT

:INSTALL_FATAL
echo [NikaForge] Fallback install also failed. Please check network manually and try again.
cd ..
pause
exit /b 1

rem ================= 5. shortcut
:CREATE_SHORTCUT
if %FIRST_RUN% neq 1 goto RUN_SERVER

echo [NikaForge] Initial setup complete. Creating desktop shortcut...
powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $shortcut = $wshell.CreateShortcut($desktop + '\NikaForge.lnk'); $shortcut.TargetPath = '%~dp0start.bat'; $shortcut.WorkingDirectory = '%~dp0'; $shortcut.IconLocation = 'cmd.exe'; $shortcut.Save()"
echo [NikaForge] Desktop shortcut created successfully!

rem ================= 6. run server
:RUN_SERVER
echo ----------------------------------------------------
echo [NikaForge] Starting backend server. PLEASE DO NOT CLOSE THIS WINDOW.
echo ----------------------------------------------------
cd backend
call bun run server.ts

pause

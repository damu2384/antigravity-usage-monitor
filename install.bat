@echo off
chcp 65001 >nul
echo 正在安装 Antigravity 用量监控...

set CONFIG_DIR=%USERPROFILE%\.gemini\config
set SIDECAR_DIR=%CONFIG_DIR%\sidecars\usage_monitor
set PLUGIN_DIR=%CONFIG_DIR%\plugins\usage-monitor

REM ---- 1. 顶层 sidecar：这样在侧边栏菜单里是一级项，点一次就能打开 ----
if not exist "%SIDECAR_DIR%" mkdir "%SIDECAR_DIR%"
xcopy /s /e /y /i "%~dp0sidecars\usage_monitor\*" "%SIDECAR_DIR%\" >nul

REM ---- 2. 插件：提供每轮摘要 Hook 与自然语言查账 Skill ----
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"
copy /y "%~dp0plugin.json" "%PLUGIN_DIR%\" >nul
copy /y "%~dp0hooks.json"  "%PLUGIN_DIR%\" >nul
xcopy /s /e /y /i "%~dp0assets" "%PLUGIN_DIR%\assets\" >nul
xcopy /s /e /y /i "%~dp0hooks"  "%PLUGIN_DIR%\hooks\"  >nul
xcopy /s /e /y /i "%~dp0skills" "%PLUGIN_DIR%\skills\" >nul

if %ERRORLEVEL% equ 0 (
    echo.
    echo =========================================================
    echo  安装完成
    echo   侧边栏面板: %SIDECAR_DIR%
    echo   插件目录:   %PLUGIN_DIR%
    echo.
    echo  侧边栏菜单里会出现一级项「用量」，点击即可打开。
    echo  若没出现，请重启 Antigravity。
    echo =========================================================
) else (
    echo 安装失败，请检查写入权限。
)
pause

@echo off
chcp 65001 >nul
echo 正在安装 Antigravity 用量监控插件...

set PLUGIN_DIR=%USERPROFILE%\.gemini\config\plugins\usage-monitor

if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"

xcopy /s /e /y /i "%~dp0plugin.json" "%PLUGIN_DIR%\" >nul
xcopy /s /e /y /i "%~dp0hooks.json" "%PLUGIN_DIR%\" >nul
xcopy /s /e /y /i "%~dp0assets" "%PLUGIN_DIR%\assets\" >nul
xcopy /s /e /y /i "%~dp0hooks" "%PLUGIN_DIR%\hooks\" >nul
xcopy /s /e /y /i "%~dp0skills" "%PLUGIN_DIR%\skills\" >nul
xcopy /s /e /y /i "%~dp0sidecars" "%PLUGIN_DIR%\sidecars\" >nul

if %ERRORLEVEL% equ 0 (
    echo.
    echo =========================================================
    echo  安装完成: %PLUGIN_DIR%
    echo.
    echo  请在 Antigravity 的插件页启用 "用量监控"，
    echo  然后打开: [用量监控](sidecar://usage-monitor/usage_panel/)
    echo =========================================================
) else (
    echo 安装失败，请检查写入权限。
)
pause

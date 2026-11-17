@echo off
chcp 65001 >nul
echo 正在安装 Antigravity 用量监控...

set PLUGIN_DIR=%USERPROFILE%\.gemini\config\plugins\usage-monitor

if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"

copy /y "%~dp0plugin.json" "%PLUGIN_DIR%\" >nul
copy /y "%~dp0hooks.json"  "%PLUGIN_DIR%\" >nul
xcopy /s /e /y /i "%~dp0assets"  "%PLUGIN_DIR%\assets\"  >nul
xcopy /s /e /y /i "%~dp0hooks"   "%PLUGIN_DIR%\hooks\"   >nul
xcopy /s /e /y /i "%~dp0skills"  "%PLUGIN_DIR%\skills\"  >nul
xcopy /s /e /y /i "%~dp0sidecars" "%PLUGIN_DIR%\sidecars\" >nul

if %ERRORLEVEL% equ 0 (
    echo.
    echo =========================================================
    echo  安装完成: %PLUGIN_DIR%
    echo.
    echo  1. 重启 Antigravity
    echo  2. 侧边栏 - Extensions - 用量
    echo.
    echo  注: 面板会归在 Extensions 分组下，这是该版本的组织方式。
    echo =========================================================
) else (
    echo 安装失败，请检查写入权限。
)
pause

@echo off
chcp 65001 >nul
echo 正在安装 Antigravity 用量监控侧边栏插件...

set TARGET_DIR=%USERPROFILE%\.gemini\config\sidecars\usage_monitor

if not exist "%TARGET_DIR%" (
    mkdir "%TARGET_DIR%"
)

copy /y "%~dp0sidecars\usage_monitor\*" "%TARGET_DIR%\" >nul

if %ERRORLEVEL% equ 0 (
    echo.
    echo ==============================================
    echo  安装成功！
    echo  插件已复制到: %TARGET_DIR%
    echo  在 Antigravity 任意对话中点击或输入即可唤起:
    echo  [用量监控](sidecar://usage_monitor/)
    echo ==============================================
) else (
    echo 安装失败，请检查写入权限。
)
pause

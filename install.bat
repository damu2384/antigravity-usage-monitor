@echo off
chcp 65001 >nul
echo 正在安装 Antigravity 全能用量监控套件 (v2.0.0)...

set CONFIG_DIR=%USERPROFILE%\.gemini\config
set SIDECAR_DIR=%CONFIG_DIR%\sidecars\usage_monitor
set SKILL_DIR=%CONFIG_DIR%\skills\usage-monitor

if not exist "%SIDECAR_DIR%" mkdir "%SIDECAR_DIR%"
if not exist "%SKILL_DIR%" mkdir "%SKILL_DIR%"

echo [1/3] 部署 Sidecar 监控面板...
xcopy /s /e /y "%~dp0sidecars\usage_monitor\*" "%SIDECAR_DIR%\" >nul

echo [2/3] 安装自然语言查账技能 (Skill)...
xcopy /s /e /y "%~dp0skills\usage-monitor\*" "%SKILL_DIR%\" >nul

echo [3/3] 部署 PostInvocation 自动播报 Hook...
if exist "%~dp0hooks.json" (
    copy /y "%~dp0hooks.json" "%CONFIG_DIR%\hooks.json" >nul
)
if exist "%~dp0hooks" (
    if not exist "%CONFIG_DIR%\hooks" mkdir "%CONFIG_DIR%\hooks"
    xcopy /s /e /y "%~dp0hooks\*" "%CONFIG_DIR%\hooks\" >nul
)

if %ERRORLEVEL% equ 0 (
    echo.
    echo ==============================================================
    echo  🎉 安装成功！用量监控全能套件已部署就绪。
    echo  - 侧边栏面板: sidecar://usage_monitor/
    echo  - 自然语言查账: 直接对 AI 提问 “查账” 或 “我用了多少Token”
    echo  - 轮次自动播报: 每次对话完成自动呈现用量小卡片
    echo ==============================================================
) else (
    echo 安装失败，请检查写入权限。
)
pause

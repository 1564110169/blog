@echo off
cd /d "%~dp0.."

echo 正在启动博客前台...
start http://localhost:4321/blog

npm.cmd run dev

pause

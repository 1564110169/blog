@echo off
setlocal

cd /d "%~dp0"

echo 正在检查端口...

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
"$client=New-Object Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1',4322); if ($client.Connected) { $client.Close(); exit 10 } } catch { exit 0 }"

if %errorlevel%==10 (
  echo [提示] 端口 4322 已被占用，后台可能已启动。
  pause
  exit /b 1
)

echo 正在启动后台...

start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ^
"Start-Sleep -Milliseconds 800; Start-Process 'http://localhost:4322/admin'"

call npm.cmd run admin

if %errorlevel% neq 0 (
  echo 后台启动失败，请检查报错。
  pause
)
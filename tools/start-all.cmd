@echo off
pushd "%~dp0.."

set "LOGDIR=%CD%\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOGFILE=%LOGDIR%\logs.txt"

echo ============================== >> "%LOGFILE%"
echo start time: %date% %time% >> "%LOGFILE%"

npm.cmd run start:all >> "%LOGFILE%" 2>&1

popd
pause

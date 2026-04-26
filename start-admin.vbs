Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
checkCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ""$client=New-Object Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1',4322); if ($client.Connected) { $client.Close(); exit 10 } } catch { exit 0 }"""
code = shell.Run(checkCommand, 0, True)

If code >= 10 Then
  MsgBox "端口 4322 已被占用，后台没有启动。" & vbCrLf & "请确认是否已经打开了后台，或关闭占用该端口的程序后重试。", vbExclamation, "博客后台"
  WScript.Quit 1
End If

serverCommand = "cmd.exe /c cd /d """ & projectDir & """ && npm.cmd run admin"
shell.Run serverCommand, 0, False
WScript.Sleep 900
shell.Run "http://localhost:4322/admin", 1, False

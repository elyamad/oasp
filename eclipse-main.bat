@echo off
pushd %~dp0
set WORKSPACE=main
call scripts\eclipse-start.bat
popd

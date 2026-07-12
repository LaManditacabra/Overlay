@echo off
set ELECTRON_RUN_AS_NODE=
echo Instalando dependencias...
call npm install
echo.
echo Generando ejecutable portable (.exe)...
call npm run build
echo.
echo Listo. El archivo deberia estar en la carpeta dist\
pause

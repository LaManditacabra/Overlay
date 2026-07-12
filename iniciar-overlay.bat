@echo off
chcp 65001 >nul
title Stream Chat Overlay - Iniciar
set ELECTRON_RUN_AS_NODE=
echo Iniciando Stream Chat Overlay (codigo actual)...
echo.
call npm start
echo.
echo (La app cerro. Cerra esta ventana.)
pause

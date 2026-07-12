@echo off
chcp 65001 >nul
title Stream Chat Overlay - Fix & Run
echo ========================================
echo   Stream Chat Overlay - Reparar y Ejecutar
echo ========================================
echo.

echo [1/3] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado o no esta en PATH.
    echo Descargalo de https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js OK:
node --version
echo.

echo [2/3] Verificando dependencias...
if not exist "node_modules" (
    echo No se encontro node_modules. Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo ERROR: Fallo npm install.
        pause
        exit /b 1
    )
) else (
    echo node_modules encontrado.
    echo Si tenes problemas de runtime, podes forzar reinstalacion manualmente.
)
echo.

echo [3/3] Iniciando la app...
echo Si se cuelga o da error de electron, probamos con --no-sandbox.
echo.
echo Ejecutando: npm start
echo.
set ELECTRON_RUN_AS_NODE=
call npm start
pause

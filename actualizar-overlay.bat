@echo off
chcp 65001 >nul
title Stream Chat Overlay - Publicar actualizacion
setlocal

cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=

echo ============================================================
echo   PUBLICAR ACTUALIZACION - Stream Chat Overlay
echo ============================================================
echo.
echo Esto compila la app y sube una nueva version a GitHub para
echo que tus amigos se actualicen solos.
echo.
echo IMPORTANTE antes de continuar:
echo   1) Sube el numero de "version" en package.json (ej: 1.0.2)
echo      si no lo cambiaste, GitHub dira "ya tenes la ultima".
echo   2) El repo de GitHub debe estar en PUBLICO.
echo.

REM --- Pedir el token de GitHub (no queda guardado en ningun archivo) ---
if "%GH_TOKEN%"=="" (
  set /p "GH_TOKEN=Pega tu token de GitHub (ghp_...) y Enter: "
)
if "%GH_TOKEN%"=="" (
  echo.
  echo [ERROR] No ingresaste ningun token. Cancelado.
  echo.
  pause
  exit /b 1
)

echo.
echo [2/3] Compilando la app (esto puede tardar varios minutos)...
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo [ERROR] Fallo la compilacion. Revisa el mensaje de arriba.
  echo.
  pause
  exit /b 1
)

echo.
echo [3/3] Subiendo la nueva version a GitHub...
echo.
call npm run publish
if errorlevel 1 (
  echo.
  echo [ERROR] Fallo la publicacion. Revisa el mensaje de arriba.
  echo   - Verifica que el token sea valido y con permiso public_repo.
  echo   - Verifica que el repo este en PUBLICO.
  echo.
  pause
  exit /b 1
)

echo.
echo [3/3] Adjuntando latest.yml a la release...
node publish-latest-yml.js
if errorlevel 1 (
  echo.
  echo [ERROR] Fallo la subida de latest.yml. Revisa el mensaje de arriba.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   LISTO! La actualizacion se publico correctamente.
echo   latest.yml fue adjuntado a la release.
echo   Tus amigos la recibiran automaticamente al abrir la app.
echo ============================================================
echo.
pause

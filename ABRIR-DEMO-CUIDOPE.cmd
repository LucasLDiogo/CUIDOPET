@echo off
chcp 65001 >nul
title Cuidope - site e app (demo)
cd /d "%~dp0apps\web"
where node >nul 2>nul || (echo Instale o Node.js 22 LTS em https://nodejs.org e rode de novo. & pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install --ignore-scripts || (pause & exit /b 1)
)
echo.
echo Abrindo http://localhost:5173  (feche esta janela para parar)
start "" http://localhost:5173
call npm run dev

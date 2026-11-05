@echo off
chcp 65001 >nul
cd /d "%~dp0"
where git >nul 2>nul || (echo Instale o Git em https://git-scm.com e rode de novo. & pause & exit /b 1)
if not exist .git git init -b main
git add -A
git commit -m "Cuidopê: site e app (apps/web), Supabase, Firebase e segurança"
echo.
echo Repositório local pronto. Para publicar no GitHub:
echo   1. Crie um repositório vazio em https://github.com/new (ex.: cuidope)
echo   2. git remote add origin https://github.com/SEU_USUARIO/cuidope.git
echo   3. git push -u origin main
echo   4. No GitHub: Settings ^> Pages ^> Source: GitHub Actions  (o link sai em ~2 min)
pause

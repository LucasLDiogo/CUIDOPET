@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Cuidope - teste local
if not defined PORT set "PORT=3333"
set "CUIDOPE_ENV=development"
set "URL=http://127.0.0.1:%PORT%"

rem ---------------------------------------------------------------
rem  Cuidope - teste local (DADOS DE DEMONSTRACAO, nenhum dinheiro real)
rem  Requisito: Node.js 22.18 ou superior  (https://nodejs.org)
rem ---------------------------------------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale a versao 22.18 ou superior em https://nodejs.org
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
if errorlevel 1 (
  echo [ERRO] Versao do Node muito antiga:
  node -v
  echo Precisa ser 22.18 ou superior.
  pause
  exit /b 1
)

if not exist "node_modules\fastify" (
  echo Instalando dependencias - so na primeira vez...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERRO] npm install falhou. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
)

:menu
cls
echo ============================================================
echo   CUIDOPE - teste local   (dados de DEMONSTRACAO)
echo ============================================================
echo.
echo   1. MODO QAS - testar como tutor e como prestador no navegador
echo   2. Teste rapido automatico - sobe a API, verifica e encerra
echo   3. Rodar TODOS os testes automaticos   (leva alguns minutos)
echo   4. Zerar os dados do QAS   (recomeca os testes do zero)
echo   5. Sair
echo.
choice /c 12345 /n /m "Escolha uma opcao: "
if errorlevel 5 goto fim
if errorlevel 4 goto zerar
if errorlevel 3 goto testes
if errorlevel 2 goto smoke
if errorlevel 1 goto qas
goto menu

:qas
cls
call :api_no_ar
if not errorlevel 1 (
  call :qas_no_ar
  if errorlevel 1 (
    echo [ATENCAO] Ja existe uma API rodando na porta %PORT%, mas ela NAO esta em modo QAS.
    echo Feche a janela "Cuidope API" e escolha esta opcao de novo.
    echo.
    pause
    goto menu
  )
  echo O modo QAS ja esta rodando na porta %PORT%.
) else (
  echo Subindo o MODO QAS em uma nova janela - a primeira vez cria o banco de demonstracao...
  start "Cuidope API" cmd /k "node scripts\qas.ts"
  call :esperar_api
  if errorlevel 1 (
    echo [ERRO] A API nao respondeu a tempo. Veja a janela "Cuidope API".
    pause
    goto menu
  )
)
echo.
echo MODO QAS no ar em %URL%/qas
start "" "%URL%/qas"
echo.
echo ------------------------------------------------------------
echo  COMO TESTAR  - roteiro completo em docs\qas.md
echo ------------------------------------------------------------
echo  Tudo e AMBIENTE DE TESTE: pagamento SANDBOX, sem dinheiro real.
echo  A caixa "Testando como" no topo troca de pessoa - nao e login real.
echo.
echo  COMO TUTOR   : escolha Ana ou Bruno, busque um servico, abra um
echo                 prestador, solicite, aceite a proposta e clique em
echo                 "Simular pagamento aprovado - sandbox".
echo  COMO PRESTADOR: escolha Carla, Diego ou Elisa e use o painel
echo                 "Agir como prestador": pedidos, proposta, reservas.
echo  Dica: faca o fluxo todo com duas abas do navegador, uma em cada papel.
echo.
echo  Para encerrar a API, feche a janela "Cuidope API".
echo.
pause
goto menu

:smoke
cls
set "JA=0"
call :api_no_ar
if not errorlevel 1 set "JA=1"
if "%JA%"=="0" (
  echo Subindo a API temporariamente...
  start "Cuidope API" /min cmd /c "node apps\api\src\server.ts"
  call :esperar_api
  if errorlevel 1 (
    echo [ERRO] A API nao respondeu a tempo.
    call :parar_api
    pause
    goto menu
  )
)
node scripts\smoke.ts "%URL%"
set "RC=%errorlevel%"
if "%JA%"=="0" call :parar_api
echo.
if "%RC%"=="0" (echo RESULTADO: OK) else (echo RESULTADO: FALHOU)
echo.
pause
goto menu

:testes
cls
echo Rodando dominio, contratos, providers, banco - RLS e fluxos - e API...
echo.
call npm test
set "RC=%errorlevel%"
echo.
if "%RC%"=="0" (echo RESULTADO: TODOS OS TESTES PASSARAM.) else (echo RESULTADO: HOUVE FALHAS - veja as linhas "not ok" acima.)
echo.
pause
goto menu

:zerar
cls
call :api_no_ar
if not errorlevel 1 (
  echo [ATENCAO] A API esta rodando. Feche a janela "Cuidope API" antes de zerar os dados.
  echo.
  pause
  goto menu
)
if not exist "data\qas-db" (
  echo Nao ha dados do QAS para apagar. Tudo ja esta zerado.
  echo.
  pause
  goto menu
)
echo Isto apaga TODOS os pedidos, reservas e avaliacoes criados no QAS.
echo Os dados de demonstracao voltam ao inicio na proxima vez que abrir o QAS.
echo.
choice /c SN /n /m "Confirma apagar os dados do QAS? [S/N] "
if errorlevel 2 goto menu
rd /s /q "data\qas-db"
echo.
echo Dados do QAS apagados.
echo.
pause
goto menu

:fim
endlocal
exit /b 0

rem ------------------------- sub-rotinas -------------------------

:api_no_ar
curl -s -f -o nul "%URL%/v1/health"
exit /b %errorlevel%

:qas_no_ar
curl -s -f -o nul "%URL%/qas"
exit /b %errorlevel%

:esperar_api
set /a TENTATIVAS=0
:esperar_loop
curl -s -f -o nul "%URL%/v1/health"
if not errorlevel 1 exit /b 0
set /a TENTATIVAS+=1
if %TENTATIVAS% geq 90 exit /b 1
ping -n 2 127.0.0.1 >nul
goto esperar_loop

:parar_api
taskkill /fi "WINDOWTITLE eq Cuidope API*" /t /f >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /pid %%p /f >nul 2>nul
exit /b 0

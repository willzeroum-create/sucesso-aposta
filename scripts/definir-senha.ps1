# Janela para definir a palavra-passe de uma conta do painel (o que se escreve não aparece no ecrã).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$Host.UI.RawUI.WindowTitle = "Painel - definir palavra-passe"
Write-Host ""
Write-Host "  Definir a palavra-passe de uma conta do painel" -ForegroundColor Cyan
Write-Host ""
$login = Read-Host "  Login (utilizador ou e-mail)"
$s1 = Read-Host "  Nova palavra-passe (nao aparece)" -AsSecureString
$s2 = Read-Host "  Repita a palavra-passe" -AsSecureString
$p1 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s1))
$p2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s2))
if ($p1 -ne $p2) { Write-Host "  As palavras-passe nao coincidem. Feche e tente de novo." -ForegroundColor Red; Read-Host "  Enter para fechar"; exit 1 }
if ([string]::IsNullOrEmpty($p1)) { Write-Host "  Palavra-passe vazia." -ForegroundColor Red; Read-Host "  Enter para fechar"; exit 1 }
$env:SET_LOGIN = $login
$env:SET_PASSWORD = $p1
& node node_modules/tsx/dist/cli.mjs --conditions=react-server scripts/set-password.mts
$env:SET_PASSWORD = ""
Write-Host ""
Read-Host "  Enter para fechar"

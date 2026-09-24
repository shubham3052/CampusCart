@echo off
:: ==============================================================================
:: CampusCart - Allow Development Ports in Windows Firewall
:: Run this file as Administrator (Right click -> Run as administrator)
:: ==============================================================================

echo.
echo ==============================================================================
echo [CampusCart] Configuring Windows Firewall for LAN Development Ports...
echo ==============================================================================
echo.

:: Check for administrative permissions
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script requires Administrator privileges!
    echo Please right-click this file and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo [1/3] Adding inbound allow rule for Django Backend (TCP Port 8000)...
netsh advfirewall firewall delete rule name="CampusCart Backend Port 8000" >nul 2>&1
netsh advfirewall firewall add rule name="CampusCart Backend Port 8000" dir=in action=allow protocol=TCP localport=8000 profile=any
if %errorlevel% equ 0 (
    echo   -- OK: Port 8000 allowed for all network profiles.
) else (
    echo   -- WARNING: Failed to configure rule for port 8000.
)

echo.
echo [2/3] Adding inbound allow rule for Vite Frontend (TCP Port 5174)...
netsh advfirewall firewall delete rule name="CampusCart Frontend Port 5174" >nul 2>&1
netsh advfirewall firewall add rule name="CampusCart Frontend Port 5174" dir=in action=allow protocol=TCP localport=5174 profile=any
if %errorlevel% equ 0 (
    echo   -- OK: Port 5174 allowed for all network profiles.
) else (
    echo   -- WARNING: Failed to configure rule for port 5174.
)

echo.
echo [3/3] Checking current IP configuration...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    echo   -- Discovered IP: %%a
)

echo.
echo ==============================================================================
echo [SUCCESS] Windows Firewall rules configured successfully!
echo You can now connect from your mobile device on the same Wi-Fi.
echo ==============================================================================
echo.
pause

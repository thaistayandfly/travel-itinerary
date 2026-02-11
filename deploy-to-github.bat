@echo off
echo ========================================
echo Travel Itinerary PWA - GitHub Deployment
echo ========================================
echo.

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed!
    echo Please install Git from: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo Git found! Starting deployment...
echo.

REM Initialize git repository
echo [1/5] Initializing git repository...
git init
if errorlevel 1 goto :error

REM Add all files
echo [2/5] Adding files...
git add .
if errorlevel 1 goto :error

REM Create initial commit
echo [3/5] Creating commit...
git commit -m "Initial commit - Offline-first Travel Itinerary PWA"
if errorlevel 1 goto :error

REM Set main branch
echo [4/5] Setting main branch...
git branch -M main
if errorlevel 1 goto :error

REM Add remote (you'll need to create the repository first on GitHub)
echo [5/5] Adding remote repository...
git remote add origin https://github.com/thaistayandfly/travel-itinerary.git
if errorlevel 1 (
    echo Remote already exists, updating...
    git remote set-url origin https://github.com/thaistayandfly/travel-itinerary.git
)

echo.
echo ========================================
echo Setup complete!
echo ========================================
echo.
echo NEXT STEPS:
echo.
echo 1. Go to: https://github.com/thaistayandfly
echo 2. Click "New repository"
echo 3. Name: travel-itinerary
echo 4. Make it Public
echo 5. DO NOT initialize with README
echo 6. Click "Create repository"
echo.
echo 7. Then come back here and run: push-to-github.bat
echo.
pause
exit /b 0

:error
echo.
echo ERROR: Something went wrong!
echo Please check the error message above.
echo.
pause
exit /b 1

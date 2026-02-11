@echo off
echo ========================================
echo Pushing to GitHub...
echo ========================================
echo.

REM Check if git is initialized
if not exist ".git" (
    echo ERROR: Git not initialized!
    echo Please run deploy-to-github.bat first
    pause
    exit /b 1
)

echo This will push your code to GitHub.
echo.
echo Make sure you have:
echo - Created the repository on GitHub
echo - You are logged into GitHub in your browser
echo.
set /p continue="Continue? (y/n): "
if /i not "%continue%"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.
echo Pushing to GitHub...
git push -u origin main

if errorlevel 1 (
    echo.
    echo ========================================
    echo AUTHENTICATION REQUIRED
    echo ========================================
    echo.
    echo If you see an authentication error, GitHub now requires a Personal Access Token.
    echo.
    echo Follow these steps:
    echo.
    echo 1. Go to: https://github.com/settings/tokens
    echo 2. Click "Generate new token" -^> "Classic"
    echo 3. Give it a name: "Deploy Travel Itinerary"
    echo 4. Select scope: "repo" (full control)
    echo 5. Click "Generate token"
    echo 6. COPY THE TOKEN (you won't see it again!)
    echo 7. When Git asks for password, paste the TOKEN (not your GitHub password)
    echo.
    echo Then run this script again.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Code pushed to GitHub
echo ========================================
echo.
echo Your code is now on GitHub at:
echo https://github.com/thaistayandfly/travel-itinerary
echo.
echo NEXT STEPS:
echo.
echo 1. Go to: https://github.com/thaistayandfly/travel-itinerary
echo 2. Click "Settings" -^> "Pages"
echo 3. Source: main branch, / (root) folder
echo 4. Click "Save"
echo 5. Wait 2 minutes
echo 6. Your site will be live at:
echo    https://thaistayandfly.github.io/travel-itinerary/
echo.
echo 7. Then edit app.js and add your Google Apps Script URL!
echo.
pause

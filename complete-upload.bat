@echo off
echo ========================================
echo GitHub Repository Creation & Upload
echo ========================================
echo.
echo Local setup is COMPLETE!
echo All files are committed and ready to push.
echo.
echo NOW YOU NEED TO:
echo.
echo 1. Create the repository on GitHub:
echo    - Open: https://github.com/new
echo    - Repository name: travel-itinerary
echo    - Owner: thaistayandfly
echo    - Make it PRIVATE (or PUBLIC - your choice)
echo    - DO NOT check "Initialize with README"
echo    - Click "Create repository"
echo.
echo    NOTE: With a private repo, your code is hidden
echo          but the website will still be publicly accessible
echo.
echo 2. Press ENTER here when you've created the repository
echo.
pause

echo.
echo Setting up remote repository...
cd /d "%~dp0"
git remote add origin https://github.com/thaistayandfly/travel-itinerary.git 2>nul
if errorlevel 1 (
    echo Remote already exists, updating URL...
    git remote set-url origin https://github.com/thaistayandfly/travel-itinerary.git
)

echo.
echo Pushing to GitHub...
echo.
echo NOTE: You will be asked to authenticate.
echo - Username: thaistayandfly
echo - Password: Use a Personal Access Token (NOT your password)
echo.
echo If you don't have a token:
echo 1. Open: https://github.com/settings/tokens
echo 2. Click "Generate new token" -^> "Classic"
echo 3. Name it: "Deploy PWA"
echo 4. Check "repo" permission
echo 5. Generate and COPY the token
echo 6. Use that token as your password
echo.
pause

git push -u origin main

if errorlevel 1 (
    echo.
    echo ========================================
    echo PUSH FAILED
    echo ========================================
    echo.
    echo This usually means:
    echo 1. Authentication failed - use Personal Access Token
    echo 2. Repository doesn't exist yet - create it on GitHub first
    echo 3. Wrong repository name
    echo.
    echo Please check and try again.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Code is on GitHub!
echo ========================================
echo.
echo Your repository: https://github.com/thaistayandfly/travel-itinerary
echo.
echo NEXT STEPS:
echo.
echo 1. Enable GitHub Pages:
echo    - Go to: https://github.com/thaistayandfly/travel-itinerary/settings/pages
echo    - Source: main branch, / (root)
echo    - Click Save
echo    - Wait 2 minutes
echo.
echo 2. Your PWA will be live at:
echo    https://thaistayandfly.github.io/travel-itinerary/
echo.
echo 3. Edit app.js to add your Google Apps Script URL:
echo    - Line 7 in app.js
echo    - Replace YOUR_APPS_SCRIPT_URL_HERE with your actual URL
echo.
echo Opening GitHub repository in browser...
start https://github.com/thaistayandfly/travel-itinerary
echo.
pause

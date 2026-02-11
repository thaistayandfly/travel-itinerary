# 🚀 Quick Setup Guide

## Step-by-Step Deployment to GitHub Pages

### ⚡ Quick Start (Easiest Method)

#### Option 1: Using the Scripts (Recommended)

1. **Double-click:** `deploy-to-github.bat`
   - This will initialize git and prepare your files

2. **Create GitHub Repository:**
   - Go to: https://github.com/thaistayandfly
   - Click **"New repository"**
   - Name: `travel-itinerary`
   - Make it **Public** ✅
   - **DO NOT** check "Initialize with README"
   - Click **"Create repository"**

3. **Double-click:** `push-to-github.bat`
   - This will push your code to GitHub
   - You may need to log in to GitHub

4. **Enable GitHub Pages:**
   - Go to repository → **Settings** → **Pages**
   - Source: **main** branch, **/ (root)** folder
   - Click **Save**
   - Wait 2 minutes ⏱️

5. **Configure API URL:**
   - Go to your repository
   - Click on `app.js`
   - Click **Edit** (pencil icon)
   - Line 7: Replace `YOUR_APPS_SCRIPT_URL_HERE` with your actual Google Apps Script URL
   - **Commit changes**

✅ **Done!** Your PWA will be live at:
```
https://thaistayandfly.github.io/travel-itinerary/
```

---

#### Option 2: Manual Upload (No Git Required)

1. **Create GitHub Repository:**
   - Go to: https://github.com/thaistayandfly
   - Click **"New repository"**
   - Name: `travel-itinerary`
   - Make it **Public** ✅
   - **DO NOT** check "Initialize with README"
   - Click **"Create repository"**

2. **Upload Files:**
   - In your new repository, click **"uploading an existing file"**
   - Drag and drop these files:
     - `index.html`
     - `styles.css`
     - `app.js`
     - `service-worker.js`
     - `manifest.json`
     - `README.md`
   - Commit message: "Initial commit"
   - Click **"Commit changes"**

3. **Enable GitHub Pages:**
   - Repository → **Settings** → **Pages**
   - Source: **main** branch, **/ (root)** folder
   - Click **Save**

4. **Configure API URL:**
   - Click on `app.js` → **Edit**
   - Line 7: Add your Google Apps Script URL
   - **Commit changes**

✅ **Done!**

---

### 🔐 Authentication Help

If Git asks for authentication:

1. **Username:** thaistayandfly
2. **Password:** Use a Personal Access Token (not your GitHub password)

**How to create a token:**
1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Classic"**
3. Name: "Deploy PWA"
4. Select: **"repo"** (full control)
5. Click **"Generate token"**
6. **COPY THE TOKEN** (you'll only see it once!)
7. Paste it when Git asks for password

---

### ✅ Verify It Works

1. Open: `https://thaistayandfly.github.io/travel-itinerary/?client=TEST&shid=YOUR_SHEET_ID`
2. Should load your itinerary ✅
3. Go offline (airplane mode)
4. Refresh page - should still work! ✅

---

### 🆘 Troubleshooting

**"Git is not installed"**
- Download: https://git-scm.com/download/win
- Install, then restart

**"Authentication failed"**
- Use Personal Access Token (see above)
- NOT your GitHub password

**"Repository already exists"**
- That's okay! Just continue with push-to-github.bat

**"Permission denied"**
- Make sure you're logged into GitHub account: thaistayandfly
- Use Personal Access Token

---

### 📞 Need Help?

**Check deployment status:**
- Go to: https://github.com/thaistayandfly/travel-itinerary
- Click "Actions" tab
- Look for green checkmark ✅

**Still having issues?**
- Check the full README.md for detailed instructions
- Review browser console for errors
- Make sure Google Apps Script is deployed

---

## 🎉 You're All Set!

Once deployed, share the URL:
```
https://thaistayandfly.github.io/travel-itinerary/?client=NAME&shid=SHEET_ID&lang=en
```

**Features:**
- ✅ Works offline
- ✅ Installable as app
- ✅ Fast & responsive
- ✅ Same beautiful design

Enjoy your offline-first travel itinerary PWA! 🚀

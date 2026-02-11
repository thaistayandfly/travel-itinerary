# Travel Itinerary PWA - Deployment Instructions

This is an offline-first Progressive Web App (PWA) for displaying travel itineraries. It fetches data from a Google Apps Script backend and works offline after the first load.

## 🏗️ Architecture

```
GitHub Pages (Static PWA)  ←→  Google Apps Script (API)
   ✅ True offline support        📊 Data from Google Sheets
   ✅ Service Worker caching       🔒 Security & validation
   ✅ Install as app               📱 Server-side processing
```

---

## 📋 Prerequisites

1. **GitHub Account** - You'll use `thaistayandfly` account
2. **Google Apps Script Web App** - Already configured in your Code.gs
3. **Google Sheets** - Your itinerary data source

---

## 🚀 Step 1: Deploy Google Apps Script API

### 1.1 Update Code.gs
✅ Already done! Your `Code.gs` now supports JSON API responses.

### 1.2 Deploy as Web App
1. Open your Google Apps Script project
2. Click **Deploy** → **New deployment**
3. Choose **Web app** as type
4. Set these options:
   - **Description:** "Travel Itinerary API"
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Click **Deploy**
6. **Copy the Web App URL** - you'll need this!
   - It will look like: `https://script.google.com/macros/s/ABC123.../exec`

### 1.3 Test the API
Open in browser:
```
YOUR_WEB_APP_URL?client=TEST&shid=YOUR_SHEET_ID&lang=en&format=json
```

You should see JSON data returned!

---

## 🌐 Step 2: Deploy to GitHub Pages

### 2.1 Create GitHub Repository

1. Go to https://github.com/thaistayandfly
2. Click **New Repository**
3. Repository settings:
   - **Name:** `travel-itinerary`
   - **Description:** "Travel Itinerary PWA with offline support"
   - **Public** ✅
   - **Initialize with README:** ❌ (we already have one)
4. Click **Create repository**

### 2.2 Upload PWA Files

**Option A: Upload via GitHub Web Interface**

1. In your new repository, click **Add file** → **Upload files**
2. Upload these files from the `pwa` folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `service-worker.js`
   - `manifest.json`
   - `README.md`
3. Commit: "Initial commit - Travel Itinerary PWA"

**Option B: Using Git Command Line**

```bash
cd "c:/Users/Elior/Downloads/Web app(Client)/pwa"
git init
git add .
git commit -m "Initial commit - Travel Itinerary PWA"
git branch -M main
git remote add origin https://github.com/thaistayandfly/travel-itinerary.git
git push -u origin main
```

### 2.3 Enable GitHub Pages

1. In your repository, go to **Settings** → **Pages**
2. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
3. Click **Save**
4. Wait 1-2 minutes for deployment
5. Your site will be live at: `https://thaistayandfly.github.io/travel-itinerary/`

---

## ⚙️ Step 3: Configure the PWA

### 3.1 Update API URL in app.js

1. Open `app.js` in your GitHub repository
2. Find line 7:
   ```javascript
   API_URL: 'YOUR_APPS_SCRIPT_URL_HERE',
   ```
3. Replace with your actual Google Apps Script web app URL:
   ```javascript
   API_URL: 'https://script.google.com/macros/s/ABC123.../exec',
   ```
4. Commit the change

### 3.2 Test the PWA

Open in browser:
```
https://thaistayandfly.github.io/travel-itinerary/?client=YourClient&shid=YOUR_SHEET_ID&lang=en
```

Replace:
- `YourClient` - with actual client name
- `YOUR_SHEET_ID` - with your Google Sheets ID

---

## 📱 Step 4: Test Offline Functionality

### 4.1 First Load (Online)
1. Open the PWA URL in your browser
2. The itinerary should load from the API
3. Check browser console: `✅ Data cached successfully`

### 4.2 Test Offline Mode
1. **Chrome:** Open DevTools → Network tab → Set to "Offline"
2. **Mobile:** Enable Airplane Mode
3. Refresh the page
4. **It should work!** ✅ The cached version will load
5. Orange "Offline Mode" badge should appear

### 4.3 Install as App
1. On Chrome desktop: Click ⊕ icon in address bar → "Install"
2. On mobile: Tap "Add to Home Screen" from browser menu
3. The app will open in standalone mode (no browser UI)

---

## 🔧 Usage

### For End Users

**URL Format:**
```
https://thaistayandfly.github.io/travel-itinerary/?client=CLIENT_NAME&shid=SHEET_ID&lang=LANGUAGE
```

**Parameters:**
- `client` - Client name (required)
- `shid` - Google Sheets ID (required)
- `lang` - Language: `en` or `he` (optional, default: `en`)

**Example:**
```
https://thaistayandfly.github.io/travel-itinerary/?client=JohnDoe&shid=1ABC...XYZ&lang=en
```

### Offline Access

1. **First time:** Must load while online
2. **After that:** Works offline (keep tab open or install as app)
3. **Refresh offline:** ✅ Works! (unlike the old version)
4. **Close & reopen offline:** ✅ Works!

---

## 🎨 Customization

### Change Colors
Edit `styles.css` - modify the `:root` CSS variables:
```css
:root {
  --ink: #1c1f24;          /* Text color */
  --accent: #b89b5e;       /* Accent/brand color */
  --paper: #f4f3ef;        /* Background */
  --card: #ffffff;         /* Card background */
}
```

### Change App Name/Icon
Edit `manifest.json`:
```json
{
  "name": "Your Custom Name",
  "short_name": "CustomApp",
  "theme_color": "#your-color"
}
```

### Add Custom Features
Edit `app.js` - all rendering logic is there

---

## 🐛 Troubleshooting

### PWA doesn't load data
- **Check:** API URL is correct in `app.js`
- **Check:** Google Apps Script is deployed and public
- **Check:** URL parameters are correct (`client` and `shid`)
- **Check:** Browser console for errors

### Offline mode doesn't work
- **Must load online first** - the initial load caches everything
- **Check:** Service worker is registered (console: `✅ Service Worker registered`)
- **Check:** Data is cached (console: `✅ Data cached successfully`)
- **Try:** Hard refresh (Ctrl+Shift+R) to re-register service worker

### Install prompt doesn't appear
- **PWA requirements:** Must be HTTPS (GitHub Pages is HTTPS ✅)
- **Chrome:** May not show if already dismissed
- **Clear:** `localStorage.removeItem('installDismissed')`

### Changes not appearing
- **Service Worker cache:** May serve old version
- **Solution:** Update `CACHE_NAME` in `service-worker.js` (e.g., `v2`, `v3`)
- **Or:** Hard refresh (Ctrl+Shift+R)

---

## 📊 Comparison: Old vs New

| Feature | Old (Apps Script Only) | New (GitHub Pages + PWA) |
|---------|----------------------|--------------------------|
| Load while offline | ❌ Browser error | ✅ Shows cached version |
| Refresh offline | ❌ Breaks | ✅ Works |
| Close & reopen offline | ❌ Doesn't work | ✅ Works |
| Install as app | ❌ Not possible | ✅ Full PWA support |
| Performance | ⚠️ Slower (server render) | ✅ Fast (cached) |
| Offline badge | ✅ Shows | ✅ Shows |

---

## 🔐 Security Notes

- Google Apps Script API is public (read-only data)
- No sensitive data should be in the itinerary (already enforced)
- Birth year verification still works for secure documents
- GitHub Pages serves over HTTPS ✅

---

## 📝 Maintenance

### Update Content
Update your Google Sheets → changes appear on next **online** load

### Update PWA Code
1. Edit files in GitHub repository
2. Commit changes
3. **Important:** Update `CACHE_NAME` in `service-worker.js`
4. GitHub Pages will auto-deploy in 1-2 minutes

### Clear All Caches
In browser console:
```javascript
localStorage.clear();
caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
location.reload();
```

---

## ✅ Success Checklist

- [ ] Google Apps Script deployed as web app
- [ ] API URL copied
- [ ] GitHub repository created
- [ ] PWA files uploaded
- [ ] GitHub Pages enabled
- [ ] API URL updated in `app.js`
- [ ] Tested online load ✅
- [ ] Tested offline mode ✅
- [ ] Installed as app ✅

---

## 🎉 You're Done!

Your travel itinerary now has **true offline support**! Users can:
- ✈️ Access itineraries anywhere
- 📱 Install as a native app
- 🌐 Work offline after first load
- 🔄 Refresh and reopen while offline

**Share the URL:**
```
https://thaistayandfly.github.io/travel-itinerary/?client=NAME&shid=SHEET_ID
```

---

## 📞 Support

For issues or questions:
- Check browser console for errors
- Review this README
- Test with a simple itinerary first

**Powered by Google Apps Script + GitHub Pages** 🚀

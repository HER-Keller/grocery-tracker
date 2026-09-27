# Grocery Tracker

A phone-friendly inventory app for the freezers and pantry. It scans barcodes, sorts items into categories automatically, tracks expiration dates, and syncs across the household through a Google Sheet.

- **Scan modes:** *Ask* shows ＋1 / −1 for the item. *Scan in* adds one with every scan. *Scan out* uses one with every scan, taking the item that expires soonest first.
- **New barcodes:** looked up on [Open Food Facts](https://world.openfoodfacts.org). The app fills in the name, brand, photo, category and a default location. Anything it can't find, you name once and it's remembered.
- **Search** across name, brand, category, location, notes and barcode. You can filter by location, *Expiring* (within 14 days) or *Out of stock*.
- **Offline:** changes are saved on the phone and sync when the connection returns.

## 1. Connect the Google Sheet (about 2 minutes)

1. Open the sheet → **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
3. Change `const PASSCODE = 'CHANGE-ME';` to your household passcode. **Save.**
4. In the function dropdown pick **setup** → **Run**. Approve the permissions prompt: Advanced → Go to project → Allow.
   This creates an **Inventory** tab (with your existing items copied in) and a **Barcodes** tab. Your original tab is not changed.
5. **Deploy → New deployment** → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**. The passcode is what protects it.
6. Copy the **Web app URL** (ends in `/exec`) into [`config.js`](config.js).

If you change `Code.gs` later, use **Deploy → Manage deployments → ✏️ → Version: New version** so the URL stays the same.

## 2. Host it (GitHub Pages)

Phone cameras only work on `https://` pages, so the app has to be hosted. GitHub Pages is free:

```bash
gh repo create grocery-tracker --public --source . --push
```

```bash
gh api -X POST repos/{owner}/grocery-tracker/pages -f "source[branch]=main" -f "source[path]=/"
```

The app will be at `https://<username>.github.io/grocery-tracker/`.

## 3. Add it to phones

Open the link → enter the passcode → **Share → Add to Home Screen**.
To add someone else, use **⋯ → Share with household**. That sends a link with the passcode built in, so send it only to the household.

## Editing the sheet directly

The **Inventory** tab is the database, and editing it by hand is fine. Keep the column order as it is and leave the ID column alone. Every open phone picks up changes within about 15 seconds.

## Local development

```bash
python3 -m http.server 8765
```

With `apiUrl` empty in `config.js`, the app runs in **demo mode** using `data.js` (a local copy of the original sheet, kept out of git) stored in the browser.

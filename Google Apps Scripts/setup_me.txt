# Lender PDF Auto-Generator — Setup Guide

## What This Does
When someone fills out your Elementor funding application, this script **automatically**:
1. Takes the form data
2. Fills in the lender HTML template (with email & phone already redacted)
3. Converts it to a PDF
4. Saves the PDF to a Google Drive folder
5. (Optional) Emails you a notification with the PDF attached

---

## Setup Steps (15–20 minutes)

### Step 1: Create a Google Drive Folder
1. Go to [Google Drive](https://drive.google.com)
2. Click **+ New → Folder**
3. Name it `Lender Applications`
4. Open the folder
5. Copy the **folder ID** from the URL bar — it's the long string after `/folders/`
   - Example: `https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ` → the ID is `1aBcDeFgHiJkLmNoPqRsTuVwXyZ`

### Step 2: Create the Google Apps Script
1. Go to [script.google.com](https://script.google.com)
2. Click **+ New Project**
3. Name the project `Lender PDF Generator` (click "Untitled project" at top)
4. Delete everything in the editor
5. Open the file `LenderPDF_AppScript.js` that I gave you
6. Copy **all** the code and paste it into the editor
7. Near the top, find this line:
   ```
   const DRIVE_FOLDER_ID = 'PASTE_YOUR_FOLDER_ID_HERE';
   ```
   Replace `PASTE_YOUR_FOLDER_ID_HERE` with your folder ID from Step 1

8. **(Optional)** To get email notifications, find this line:
   ```
   const NOTIFY_EMAIL = '';
   ```
   Add your email: `const NOTIFY_EMAIL = 'you@crystalcapp.com';`

9. Click **Save** (Ctrl+S)

### Step 3: Test It
1. In the Apps Script editor, find the function dropdown at the top (it says "doPost")
2. Change it to `testGenerate`
3. Click **Run** (the ▶ play button)
4. Google will ask you to authorize — click through:
   - "Review Permissions" → Choose your Google account → "Advanced" → "Go to Lender PDF Generator" → "Allow"
5. Check your `Lender Applications` folder in Google Drive — you should see a test PDF!
6. Open it to verify it looks right

### Step 4: Deploy as a Web App
1. In the Apps Script editor, click **Deploy → New deployment**
2. Click the gear icon ⚙ next to "Select type" → choose **Web app**
3. Fill in:
   - **Description:** `Lender PDF Generator`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy**
5. You'll see a **Web app URL** — **copy this URL**. It looks like:
   `https://script.google.com/macros/s/AKfycbx.../exec`

> ⚠️ **Save this URL** — you'll paste it into Elementor next.

### Step 5: Connect Elementor
1. Go to your WordPress admin → open the page with your funding application form
2. Edit the page with Elementor
3. Click on your form widget
4. Go to **Actions After Submit**
5. Click **+ Add Action** → select **Webhook**
6. In the Webhook settings:
   - **Webhook URL:** Paste the Web App URL from Step 4
   - **Advanced Data:** Leave as `No` (the script handles both formats)
7. **Save** and **Publish** the page

### Step 6: Do a Live Test
1. Fill out your form with test data and submit
2. Wait 10–30 seconds
3. Check your `Lender Applications` folder in Google Drive
4. You should see a new PDF named like: `Lender_App_TestBusiness_2026-02-25.pdf`

---

## Troubleshooting

**PDF not showing up?**
- Go to [script.google.com](https://script.google.com) → open your project → click **Executions** in the left sidebar to see logs and errors
- Make sure the Elementor form field IDs match the variable names the script expects (see "Field Mapping" below)

**Want to update the script?**
- After editing code, you must redeploy: **Deploy → Manage deployments → Edit (pencil icon) → Version: New version → Deploy**

**Elementor field IDs don't match?**
- In Elementor, each form field has an **ID** (under the Advanced tab of each field). These IDs need to match what the script expects. See the mapping below.

---

## Field Mapping Reference

Your Elementor form field IDs should match these names:

| Elementor Field ID | What It Is |
|---|---|
| `basic_first_name` | Applicant first name |
| `basic_last_name` | Applicant last name |
| `basic_email` | Email *(redacted in lender copy)* |
| `basic_phone_number` | Phone *(redacted in lender copy)* |
| `basic_credit_score` | Stated credit score |
| `owner_title` | Title (CEO, Owner, etc.) |
| `own_100percent` | 100% owner? (Yes/No) |
| `owner_birth` | Date of birth |
| `owner_ssn` | SSN |
| `owner_credit_score` | Owner credit score |
| `monthly_mortage_payment_amount` | Monthly mortgage |
| `owner_address` | Home address line 1 |
| `owner_address2` | Home address line 2 |
| `owner_city` | Home city |
| `owner_state` | Home state |
| `owner_zip` | Home zip |
| `basic_business_name` | Legal business name |
| `basic_business_type` | Entity type (LLC, Corp, etc.) |
| `business_ein` | Business EIN |
| `business_type` | Business type |
| `basic_industry_parent` | Industry |
| `basic_industry_sub` | Sub-industry |
| `basic_years_in_business` | Years in business |
| `business_count` | Employee count |
| `ownership_start_date` | Ownership start date |
| `website` | Business website |
| `bussiness_address` | Business address line 1 |
| `bussiness_address2` | Business address line 2 |
| `business_city` | Business city |
| `business_state` | Business state |
| `business_zip` | Business zip |
| `location_rent_own` | Rent or own? |
| `monthly_rent_payment_amount` | Monthly rent |
| `landlord_contact_name` | Landlord name |
| `landlord_phone_number` | Landlord phone *(redacted in lender copy)* |
| `business_description` | Business description |
| `basic_desired_amount` | Requested funding amount |
| `basic_last_3_months_avg_deposit_volume` | Avg monthly revenue |
| `basic_purpose_of_funding` | Purpose of funding |
| `basic_how_soon` | How soon needed |
| `mca_yes_no` | Existing MCA? |
| `with_which_company` | MCA provider |
| `approximate_existing_balance` | Existing MCA balance |
| `monthlly_credit_card_volume` | Monthly CC volume |
| `signature` | Applicant signature |

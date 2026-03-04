// =============================================================
//  Crystal Capital Partners — Application Processor v4
//  Google Apps Script (Web App)
//
//  TWO INTAKE METHODS:
//  A) WEBHOOK — receives POST from WordPress when a new app is submitted
//  B) API PULL — polls WordPress API on a schedule for new applications
//
//  FOR EACH NEW APPLICATION:
//  1. Creates a Google Drive folder named after the business
//  2. Saves FULL HTML (dark crystal theme, all data) to folder
//  3. Saves REDACTED LENDER PDF (clean white, PII masked) to folder
//  4. Fetches uploaded documents (bank stmts, ID, signature, etc.) from WordPress URLs
//  5. Sends email notification with preview link
// =============================================================

// ─── CONFIGURATION ──────────────────────────────────────────
const PARENT_FOLDER_ID = '1Gg3caMFBM5P5A3ts75UiwjVUAu9Vb1RQ';
const NOTIFY_EMAIL = 'admin@crystalcapp.com';
const WEB_APP_URL = 'https://script.google.com/a/macros/crystalcapp.com/s/AKfycbwCjfIFdnpdZGZK4KLyQU7zjYUwze9p3amsPD3KEIYAcpRf32SuFfC0FsxsoZJZOKl_/exec';

// WordPress API (for pull method)
const WP_API_URL = 'https://crystalcapp.com/wp-json/api/v1/client-applications';
const WP_API_KEY = '9f3c8a1d2b4e7f9c0a6d8e1b2c4f5a7d9e0c1b2a3d4e5f6a7b8c9d0e1f2a';


// ─── METHOD A: WEBHOOK HANDLER ──────────────────────────────

function doPost(e) {
  try {
    var data = {};
    if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
        if (data.fields) {
          var parsed = {};
          if (Array.isArray(data.fields)) {
            data.fields.forEach(function(f) { parsed[f.id] = f.value || ''; });
          } else {
            parsed = data.fields;
          }
          data = parsed;
        }
      } catch (jsonErr) {
        data = e.parameter || {};
      }
    } else {
      data = e.parameter || {};
    }

    var result = processApplication(data);

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        folderId: result.folderId,
        folderUrl: result.folderUrl,
        previewUrl: result.previewUrl
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Webhook Error: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var viewId = (e && e.parameter && e.parameter.view) ? e.parameter.view : null;
  if (viewId) {
    try {
      var file = DriveApp.getFileById(viewId);
      var html = file.getBlob().getDataAsString();
      return HtmlService.createHtmlOutput(html)
        .setTitle('Application Preview')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      return HtmlService.createHtmlOutput('<h2>File not found</h2><p>' + err.toString() + '</p>');
    }
  }
  return ContentService.createTextOutput('Crystal Capital webhook is live.').setMimeType(ContentService.MimeType.TEXT);
}


// ─── METHOD B: API PULL ─────────────────────────────────────

function checkForNewApplications() {
  try {
    var response = UrlFetchApp.fetch(WP_API_URL, {
      method: 'get',
      headers: { 'crystalcapp-api-key': WP_API_KEY },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('API error: HTTP ' + response.getResponseCode());
      return;
    }

    var applications = JSON.parse(response.getContentText());
    if (!Array.isArray(applications) || applications.length === 0) {
      Logger.log('No applications found.');
      return;
    }

    // Track which submissions we've already processed
    var props = PropertiesService.getScriptProperties();
    var processedRaw = props.getProperty('processed_submissions') || '[]';
    var processed = JSON.parse(processedRaw);

    var newCount = 0;
    applications.forEach(function(app) {
      var subId = app.submission_id || '';
      if (subId && processed.indexOf(subId) === -1) {
        // New application — process it
        try {
          processApplication(app);
          processed.push(subId);
          newCount++;
          Logger.log('Processed new app: ' + (app.basic_business_name || 'Unknown') + ' (' + subId + ')');
        } catch (procErr) {
          Logger.log('Error processing ' + subId + ': ' + procErr.toString());
        }
      }
    });

    // Keep only last 500 processed IDs to avoid storage limits
    if (processed.length > 500) {
      processed = processed.slice(processed.length - 500);
    }
    props.setProperty('processed_submissions', JSON.stringify(processed));

    Logger.log('Check complete. New: ' + newCount + ', Total tracked: ' + processed.length);

  } catch (err) {
    Logger.log('checkForNewApplications error: ' + err.toString());
  }
}

// Run this ONCE to set up the automatic polling trigger (every 5 minutes)
function setupPullTrigger() {
  // Remove any existing triggers first
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'checkForNewApplications') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Create new trigger
  ScriptApp.newTrigger('checkForNewApplications')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('Pull trigger set: checkForNewApplications every 5 minutes.');
}

// Run this to stop automatic polling
function removePullTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'checkForNewApplications') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log('Removed ' + removed + ' trigger(s).');
}


// ─── CORE: PROCESS A SINGLE APPLICATION ─────────────────────

function processApplication(data) {
  var parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
  var now = new Date();

  // Parse created_at if available
  var submittedDate;
  if (data.created_at) {
    var d = new Date(data.created_at.replace(' ', 'T') + 'Z');
    if (!isNaN(d.getTime())) {
      submittedDate = d;
    }
  }
  if (!submittedDate) submittedDate = now;

  var dateStr = submittedDate.getFullYear() + '-' + pad(submittedDate.getMonth()+1) + '-' + pad(submittedDate.getDate());

  // Business name
  var businessName = (data.basic_business_name || 'Unknown_Business').trim();
  var safeName = businessName.replace(/[^a-zA-Z0-9 \-\.]/g, '').replace(/\s+/g, ' ').trim();
  var applicantName = ((data.basic_first_name || '') + ' ' + (data.basic_last_name || '')).trim();

  // Application ID
  var appId = data.submission_id || data.application_id || ('CCP-' + dateStr + '-' + pad(submittedDate.getHours()) + pad(submittedDate.getMinutes()));

  // Parse credit score for the score bar
  var creditScoreDisplay = data.owner_credit_score || data.basic_credit_score || '';
  var creditScoreNum = parseCreditScore(creditScoreDisplay);
  var creditPct = Math.round(((creditScoreNum - 300) / 550) * 100);

  // Inject computed fields into data
  data.application_id = appId;
  data.submitted_date = formatDate(submittedDate);
  data.submitted_date_short = formatDateShort(submittedDate);
  data.owner_credit_score_display = creditScoreDisplay;
  data.owner_credit_score_num = String(creditScoreNum);
  data.owner_credit_score_pct = String(creditPct);

  // ── 1. Create subfolder ──
  var folderName = safeName + ' — ' + dateStr;
  var folder = parentFolder.createFolder(folderName);
  Logger.log('Created folder: ' + folderName);

  // ── 2. Generate FULL HTML ──
  var fullHtml = populateTemplate(getFullTemplate(), data, false);
  var htmlFile = folder.createFile(safeName + '_Application_' + dateStr + '.html', fullHtml, 'text/html');

  // ── 3. Generate REDACTED LENDER PDF ──
  var redactedHtml = populateTemplate(getLenderTemplate(), data, true);
  var pdfBlob = Utilities.newBlob(redactedHtml, 'text/html', 'temp.html').getAs('application/pdf');
  pdfBlob.setName(safeName + '_Lender_' + dateStr + '.pdf');
  var pdfFile = folder.createFile(pdfBlob);

  // ── 4. Fetch uploaded documents ──
  var fileFields = [
    'last4_bank_statement1', 'last4_bank_statement2',
    'last4_bank_statement3', 'last4_bank_statement4',
    'driver_license', 'voided_check', 'signature'
  ];

  var fetchedFiles = [];
  fileFields.forEach(function(fieldName) {
    var url = (data[fieldName] || '').toString().trim();
    if (url && url.indexOf('http') === 0) {
      try {
        var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        if (resp.getResponseCode() === 200) {
          var blob = resp.getBlob();
          var urlParts = url.split('/');
          var rawName = urlParts[urlParts.length - 1].split('?')[0];
          try { rawName = decodeURIComponent(rawName); } catch(de) {}

          // Clean up file name
          if (fieldName === 'signature') {
            rawName = 'Signature_' + safeName.replace(/\s/g,'_') + '.png';
          } else if (!rawName || rawName.length < 2) {
            rawName = fieldName + '_' + dateStr;
          }

          blob.setName(rawName);
          var savedFile = folder.createFile(blob);
          fetchedFiles.push({ field: fieldName, name: rawName, id: savedFile.getId() });
          Logger.log('Fetched: ' + rawName);
        }
      } catch (fetchErr) {
        Logger.log('Fetch error ' + fieldName + ': ' + fetchErr.toString());
      }
    }
  });

  Logger.log('Files fetched: ' + fetchedFiles.length);

  // ── 5. Preview URL ──
  var previewUrl = WEB_APP_URL + '?view=' + htmlFile.getId();

  // ── 6. Email notification ──
  if (NOTIFY_EMAIL) {
    try {
      var filesHtml = '';
      if (fetchedFiles.length > 0) {
        filesHtml = '<tr><td colspan="2" style="padding:12px 0 4px 0;font-size:11px;font-weight:bold;color:#0d2137;">Uploaded Documents (' + fetchedFiles.length + ')</td></tr>';
        fetchedFiles.forEach(function(f) {
          filesHtml += '<tr><td colspan="2" style="padding:2px 0;font-size:13px;">&#128206; ' + f.name + '</td></tr>';
        });
      }

      var htmlBody = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
        '<div style="background:#0d2137;padding:20px 24px;border-radius:8px 8px 0 0;">' +
          '<span style="color:#fff;font-size:18px;font-weight:bold;">Crystal Capital Partners</span><br>' +
          '<span style="color:#7da8c8;font-size:11px;letter-spacing:1px;">NEW APPLICATION RECEIVED</span>' +
        '</div>' +
        '<div style="background:#f7f9fb;padding:20px 24px;border:1px solid #e0e6ec;border-top:none;">' +
          '<table style="width:100%;border-collapse:collapse;">' +
            '<tr>' +
              '<td style="padding:4px 0;font-size:13px;color:#666;width:140px;">Business</td>' +
              '<td style="padding:4px 0;font-size:14px;font-weight:bold;color:#0d2137;">' + businessName + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td style="padding:4px 0;font-size:13px;color:#666;">Applicant</td>' +
              '<td style="padding:4px 0;font-size:14px;color:#222;">' + applicantName + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td style="padding:4px 0;font-size:13px;color:#666;">Credit Score</td>' +
              '<td style="padding:4px 0;font-size:14px;color:#222;">' + creditScoreDisplay + '</td>' +
            '</tr>' +
            '<tr><td colspan="2" style="padding:8px 0 4px 0;border-top:1px solid #e0e6ec;"></td></tr>' +
            '<tr>' +
              '<td style="padding:4px 0;font-size:13px;color:#666;">Requested Amount</td>' +
              '<td style="padding:4px 0;font-size:14px;font-weight:bold;color:#0a7a48;">' + (data.basic_desired_amount || 'N/A') + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td style="padding:4px 0;font-size:13px;color:#666;">Avg Monthly Revenue</td>' +
              '<td style="padding:4px 0;font-size:14px;font-weight:bold;color:#0a7a48;">' + (data.basic_last_3_months_avg_deposit_volume || 'N/A') + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td style="padding:4px 0;font-size:13px;color:#666;">How Soon Needed</td>' +
              '<td style="padding:4px 0;font-size:14px;color:#222;">' + (data.basic_how_soon || 'N/A') + '</td>' +
            '</tr>' +
          '</table>' +
        '</div>' +
        '<div style="padding:16px 24px;border:1px solid #e0e6ec;border-top:none;">' +
          '<table style="width:100%;border-collapse:collapse;">' +
            '<tr><td colspan="2" style="padding:0 0 10px 0;">' +
              '<a href="' + previewUrl + '" style="display:inline-block;background:#0d2137;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;font-size:13px;font-weight:bold;">Preview Full Application</a>' +
            '</td></tr>' +
            '<tr>' +
              '<td style="padding:4px 0;font-size:13px;">&#128193; <a href="' + folder.getUrl() + '" style="color:#1a5276;">Drive Folder</a></td>' +
              '<td style="padding:4px 0;font-size:13px;">&#128209; <a href="' + pdfFile.getUrl() + '" style="color:#1a5276;">Lender PDF</a></td>' +
            '</tr>' +
            filesHtml +
          '</table>' +
        '</div>' +
        '<div style="padding:12px 24px;font-size:10px;color:#999;border:1px solid #e0e6ec;border-top:none;border-radius:0 0 8px 8px;">' +
          'Crystal Capital Partners &middot; Automated notification &middot; Do not reply' +
        '</div>' +
      '</div>';

      var plainBody = 'New application: ' + businessName + ' — ' + applicantName + '\n' +
            'Amount: ' + (data.basic_desired_amount || 'N/A') + '\n' +
            'Preview: ' + previewUrl + '\n' +
            'Folder: ' + folder.getUrl() + '\n';

      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: 'New App: ' + safeName + ' — ' + applicantName,
        body: plainBody,
        htmlBody: htmlBody,
        name: 'Crystal Capital Partners'
      });
    } catch (mailErr) {
      Logger.log('Email error: ' + mailErr.toString());
    }
  }

  return {
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    htmlFileId: htmlFile.getId(),
    pdfFileId: pdfFile.getId(),
    previewUrl: previewUrl,
    fetchedFiles: fetchedFiles.length
  };
}


// ─── TEMPLATE POPULATION ────────────────────────────────────

function populateTemplate(html, data, redact) {
  var r = {
    '{{application_id}}': data.application_id || '',
    '{{submitted_date}}': data.submitted_date || '',
    '{{submitted_date_short}}': data.submitted_date_short || '',
    '{{basic_first_name}}': data.basic_first_name || '',
    '{{basic_last_name}}': data.basic_last_name || '',
    '{{basic_credit_score}}': data.basic_credit_score || '',
    '{{owner_title}}': data.owner_title || '',
    '{{own_100percent}}': data.own_100percent || '',
    '{{owner_birth}}': data.owner_birth || '',
    '{{owner_ssn}}': data.owner_ssn || '',
    '{{owner_credit_score}}': data.owner_credit_score_num || data.owner_credit_score || '',
    '{{owner_credit_score_pct}}': data.owner_credit_score_pct || '50',
    '{{monthly_mortage_payment_amount}}': formatMoney(data.monthly_mortage_payment_amount),
    '{{owner_address}}': data.owner_address || '',
    '{{owner_address2}}': data.owner_address2 || '',
    '{{owner_city}}': data.owner_city || '',
    '{{owner_state}}': data.owner_state || '',
    '{{owner_zip}}': data.owner_zip || '',
    '{{basic_business_name}}': data.basic_business_name || '',
    '{{basic_business_type}}': data.basic_business_type || '',
    '{{basic_industry_parent}}': formatIndustry(data.basic_industry_parent || ''),
    '{{basic_industry_sub}}': data.basic_industry_sub || '',
    '{{basic_years_in_business}}': data.basic_years_in_business || '',
    '{{business_type}}': data.business_type || '',
    '{{business_ein}}': data.business_ein || '',
    '{{business_count}}': data.business_count || '',
    '{{state_of_incorporation}}': data.state_of_incorporation || '',
    '{{ownership_start_date}}': data.ownership_start_date || '',
    '{{website}}': data.website || '',
    '{{bussiness_address}}': data.bussiness_address || '',
    '{{bussiness_address2}}': data.bussiness_address2 || '',
    '{{business_city}}': data.business_city || '',
    '{{business_state}}': data.business_state || '',
    '{{business_zip}}': data.business_zip || '',
    '{{location_rent_own}}': data.location_rent_own || '',
    '{{monthly_rent_payment_amount}}': formatMoney(data.monthly_rent_payment_amount),
    '{{landlord_contact_name}}': data.landlord_contact_name || '',
    '{{business_description}}': data.business_description || '',
    '{{basic_desired_amount}}': data.basic_desired_amount || '',
    '{{basic_last_3_months_avg_deposit_volume}}': data.basic_last_3_months_avg_deposit_volume || '',
    '{{basic_purpose_of_funding}}': data.basic_purpose_of_funding || '',
    '{{basic_how_soon}}': data.basic_how_soon || '',
    '{{mca_yes_no}}': data.mca_yes_no || '',
    '{{with_which_company}}': data.with_which_company || '',
    '{{approximate_existing_balance}}': formatMoney(data.approximate_existing_balance),
    '{{monthlly_credit_card_volume}}': formatMoney(data.monthlly_credit_card_volume),
    '{{signature}}': data.signature || '',
    '{{signature_date}}': data.submitted_date || '',
    // Document checklist (for full HTML)
    '{{bank_stmt_status}}': data.last4_bank_statement1 ? 'received' : 'pending-doc',
    '{{bank_stmt_label}}': data.last4_bank_statement1 ? 'Received' : 'Pending',
    '{{app_status}}': 'received',
    '{{app_label}}': 'Received',
    '{{id_status}}': data.driver_license ? 'received' : 'pending-doc',
    '{{id_label}}': data.driver_license ? 'Received' : 'Pending',
    '{{check_status}}': data.voided_check ? 'received' : 'pending-doc',
    '{{check_label}}': data.voided_check ? 'Received' : 'Pending',
    '{{last4_bank_statement1}}': data.last4_bank_statement1 || '',
    '{{last4_bank_statement2}}': data.last4_bank_statement2 || '',
    '{{last4_bank_statement3}}': data.last4_bank_statement3 || '',
    '{{last4_bank_statement4}}': data.last4_bank_statement4 || '',
    '{{driver_license}}': data.driver_license || '',
    '{{voided_check}}': data.voided_check || '',
  };

  if (!redact) {
    r['{{basic_email}}'] = data.basic_email || '';
    r['{{basic_phone_number}}'] = data.basic_phone_number || '';
    r['{{landlord_phone_number}}'] = data.landlord_phone_number || '';
  }

  for (var key in r) {
    html = html.split(key).join(r[key]);
  }
  return html;
}


// ─── HELPERS ────────────────────────────────────────────────

function pad(n) { return n < 10 ? '0' + n : String(n); }

function formatDate(d) {
  var m = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return m[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function formatDateShort(d) {
  return pad(d.getMonth()+1) + '/' + pad(d.getDate()) + '/' + d.getFullYear();
}

// Parse credit score from range strings like "700-749" or "Good (680-719)"
function parseCreditScore(val) {
  if (!val) return 650;
  var numMatch = val.match(/(\d{3})/);
  if (numMatch) {
    var nums = val.match(/(\d{3})/g);
    if (nums.length >= 2) {
      return Math.round((parseInt(nums[0]) + parseInt(nums[1])) / 2);
    }
    return parseInt(nums[0]);
  }
  return 650;
}

// Format money values — adds $ if missing, handles "0.00"
function formatMoney(val) {
  if (!val || val === '0.00' || val === '0') return '$0';
  val = String(val).trim();
  if (val.charAt(0) !== '$') {
    var num = parseFloat(val);
    if (!isNaN(num)) {
      return '$' + num.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});
    }
  }
  return val;
}

// Format industry slug to readable name — "real_estate" → "Real Estate"
function formatIndustry(val) {
  if (!val) return '';
  return val.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}


// ─── TEST FUNCTIONS ─────────────────────────────────────────

function testGenerate() {
  var sampleData = {
    submission_id: 'TEST-' + new Date().getTime(),
    basic_first_name: 'John',
    basic_last_name: 'Smith',
    basic_email: 'john@smithconstruction.com',
    basic_phone_number: '(555) 123-4567',
    basic_credit_score: 'Excellent (720+)',
    owner_title: 'CEO',
    own_100percent: 'Yes',
    owner_birth: '1985-01-15',
    owner_ssn: '***-**-1234',
    owner_credit_score: '700-749',
    monthly_mortage_payment_amount: '2500.00',
    owner_address: '123 Main Street',
    owner_address2: 'Suite 100',
    owner_city: 'Los Angeles',
    owner_state: 'CA',
    owner_zip: '90001',
    basic_business_name: 'Smith Construction LLC',
    basic_business_type: 'LLC',
    basic_industry_parent: 'real_estate',
    basic_industry_sub: 'General Contractor',
    basic_years_in_business: 'Greater than 3 Years',
    business_type: 'Corporation',
    state_of_incorporation: 'California',
    business_ein: '12-3456789',
    business_count: '25-49',
    ownership_start_date: '2017-03-01',
    website: 'smithconstruction.com',
    bussiness_address: '456 Commerce Blvd',
    bussiness_address2: '',
    business_city: 'Los Angeles',
    business_state: 'CA',
    business_zip: '90015',
    location_rent_own: 'rent',
    monthly_rent_payment_amount: '4200.00',
    landlord_contact_name: 'ABC Property Mgmt',
    landlord_phone_number: '(555) 987-6543',
    business_description: 'Full-service general contractor specializing in commercial and residential projects throughout Southern California.',
    basic_desired_amount: '$100,001 - $250,000',
    basic_last_3_months_avg_deposit_volume: '$60,000 - $100,000',
    basic_purpose_of_funding: 'Equipment Purchase',
    basic_how_soon: 'One week',
    mca_yes_no: 'no',
    with_which_company: '',
    approximate_existing_balance: '0.00',
    monthlly_credit_card_volume: '12000.00',
    signature: 'John Smith',
    created_at: '2026-02-26 14:30:00',
  };

  var result = processApplication(sampleData);
  Logger.log('=== TEST COMPLETE ===');
  Logger.log('Folder: ' + result.folderUrl);
  Logger.log('Preview: ' + result.previewUrl);
}

function testFetchAPI() {
  var response = UrlFetchApp.fetch(WP_API_URL, {
    method: 'get',
    headers: { 'crystalcapp-api-key': WP_API_KEY }
  });
  var data = JSON.parse(response.getContentText());
  Logger.log(JSON.stringify(data, null, 2));
}

// Run this to process ALL existing applications from the API (one-time catch-up)
function processAllExisting() {
  var response = UrlFetchApp.fetch(WP_API_URL, {
    method: 'get',
    headers: { 'crystalcapp-api-key': WP_API_KEY },
    muteHttpExceptions: true
  });
  var apps = JSON.parse(response.getContentText());
  Logger.log('Found ' + apps.length + ' applications');
  apps.forEach(function(app, i) {
    try {
      processApplication(app);
      Logger.log((i+1) + '/' + apps.length + ' processed: ' + (app.basic_business_name || 'Unknown'));
    } catch (err) {
      Logger.log('Error on ' + (app.basic_business_name || 'Unknown') + ': ' + err.toString());
    }
  });
}


// ─── TEMPLATES ──────────────────────────────────────────────

function getFullTemplate() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Business Funding Application — Crystal Capital Partners</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --brand:      #1a6eb5;
    --brand-lt:   #2e8fd4;
    --brand-glow: #4aaef7;
    --crystal:    #c8e6f5;
    --deep:       #060f1c;
    --glass:      rgba(200,230,245,0.06);
    --border:     rgba(200,230,245,0.13);
    --text:       #e4f2fc;
    --muted:      rgba(200,230,245,0.48);
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--deep); color:var(--text); font-family:'DM Mono',monospace; min-height:100vh; overflow-x:hidden; position:relative; }
  body::before {
    content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
    background:
      radial-gradient(ellipse 80% 55% at 18% 18%, rgba(26,110,181,0.22) 0%, transparent 60%),
      radial-gradient(ellipse 55% 55% at 82% 80%, rgba(46,143,212,0.10) 0%, transparent 55%),
      radial-gradient(ellipse 100% 80% at 50% 0%, rgba(6,15,28,0.95) 0%, transparent 80%);
  }
  body::after {
    content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
    background-image: linear-gradient(135deg, rgba(200,230,245,0.028) 1px, transparent 1px), linear-gradient(-135deg, rgba(200,230,245,0.028) 1px, transparent 1px);
    background-size:60px 60px;
  }
  .page-wrapper { position:relative; z-index:1; max-width:820px; margin:0 auto; padding:48px 24px 80px; }

  /* HEADER */
  .header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:56px; animation:fadeDown 0.8s ease both; }
  .logo-area { display:flex; align-items:center; gap:16px; }
  .logo-img { width:52px; height:52px; object-fit:contain; border-radius:8px; background:rgba(255,255,255,0.92); padding:6px; }
  .logo-text .brand { font-family:'Cormorant Garamond',serif; font-size:1.55rem; font-weight:300; letter-spacing:0.18em; color:var(--crystal); text-transform:uppercase; line-height:1.1; }
  .logo-text .tagline { font-size:0.58rem; letter-spacing:0.32em; color:var(--muted); text-transform:uppercase; margin-top:5px; }
  .app-meta { text-align:right; }
  .app-meta .app-id { font-size:0.62rem; letter-spacing:0.22em; color:var(--brand-glow); text-transform:uppercase; }
  .app-meta .app-date { font-size:0.58rem; color:var(--muted); margin-top:5px; }
  .status-badge { display:inline-flex; align-items:center; gap:6px; margin-top:10px; padding:4px 12px; border:1px solid rgba(74,174,247,0.35); border-radius:2px; font-size:0.53rem; letter-spacing:0.24em; color:var(--brand-glow); text-transform:uppercase; background:rgba(74,174,247,0.07); }
  .status-dot { width:5px; height:5px; border-radius:50%; background:var(--brand-glow); animation:pulse 2s ease-in-out infinite; }

  /* SECTION LABELS */
  .section-label { display:flex; align-items:center; gap:16px; margin-bottom:20px; animation:fadeUp 0.6s ease both; }
  .section-label .num { font-size:0.55rem; color:var(--brand-glow); letter-spacing:0.2em; }
  .section-label h2 { font-family:'Cormorant Garamond',serif; font-size:1.05rem; font-weight:300; letter-spacing:0.15em; text-transform:uppercase; color:var(--crystal); white-space:nowrap; }
  .section-label .line { flex:1; height:1px; background:var(--border); }

  /* GLASS CARD */
  .glass-card { background:var(--glass); border:1px solid var(--border); border-radius:4px; backdrop-filter:blur(20px); margin-bottom:40px; overflow:hidden; animation:fadeUp 0.7s ease both; }
  .glass-card.d1 { animation-delay:0.1s; }
  .glass-card.d2 { animation-delay:0.2s; }
  .glass-card.d3 { animation-delay:0.3s; }
  .glass-card.d4 { animation-delay:0.4s; }

  /* FIELD GRID */
  .field-grid { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--border); }
  .field-grid.thirds { grid-template-columns:1fr 1fr 1fr; }
  .field-item { background:var(--deep); padding:18px 20px; }
  .field-item.full { grid-column:1 / -1; }
  .field-label { font-size:0.55rem; letter-spacing:0.25em; color:var(--muted); text-transform:uppercase; margin-bottom:8px; }
  .field-value { font-size:0.85rem; color:var(--text); font-weight:400; letter-spacing:0.02em; line-height:1.5; }
  .field-value.large { font-family:'Cormorant Garamond',serif; font-size:1.4rem; font-weight:300; color:var(--crystal); }
  .field-value.accent { color:var(--brand-glow); font-weight:500; }
  .field-value.mono { font-family:'DM Mono',monospace; font-size:0.8rem; }
  .field-value.positive { color:#6ecfa0; }

  /* SCORE BAR */
  .score-section { padding:24px 32px; border-top:1px solid var(--border); display:grid; grid-template-columns:1fr auto; align-items:center; gap:24px; }
  .score-label { font-size:0.55rem; letter-spacing:0.25em; color:var(--muted); text-transform:uppercase; margin-bottom:10px; }
  .score-bar-track { height:3px; background:rgba(200,230,245,0.1); border-radius:2px; overflow:hidden; margin-bottom:8px; }
  .score-bar-fill { height:100%; border-radius:2px; background:linear-gradient(90deg,var(--brand),var(--brand-glow)); animation:barGrow 1.2s cubic-bezier(0.4,0,0.2,1) 0.5s both; transform-origin:left; }
  .score-range { display:flex; justify-content:space-between; font-size:0.5rem; color:var(--muted); letter-spacing:0.1em; }
  .score-value { font-family:'Cormorant Garamond',serif; font-size:2.8rem; font-weight:300; color:var(--crystal); line-height:1; }

  /* FUNDING HERO */
  .funding-hero { padding:36px; }
  .funding-hero-inner { display:flex; align-items:center; justify-content:space-between; gap:40px; }
  .hero-divider { width:1px; height:80px; background:var(--border); flex-shrink:0; }
  .hero-amount { font-family:'Cormorant Garamond',serif; font-size:3.8rem; font-weight:300; color:var(--brand-glow); line-height:1; letter-spacing:-0.02em; }
  .hero-sub { font-size:0.55rem; color:var(--muted); letter-spacing:0.22em; text-transform:uppercase; margin-top:10px; }
  .hero-stat-val { font-family:'Cormorant Garamond',serif; font-size:1.6rem; font-weight:300; color:var(--crystal); line-height:1.2; }
  .hero-stat-sub { font-size:0.58rem; color:var(--muted); letter-spacing:0.2em; text-transform:uppercase; margin-top:6px; }

  /* STAT ROW */
  .stat-row { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--border); }
  .stat-item { background:var(--deep); padding:20px; text-align:center; }
  .stat-label { font-size:0.5rem; letter-spacing:0.2em; color:var(--muted); text-transform:uppercase; margin-bottom:10px; }
  .stat-value { font-family:'Cormorant Garamond',serif; font-size:1.5rem; font-weight:300; color:var(--crystal); }
  .stat-value.positive { color:#6ecfa0; }

  /* DOC LIST */
  .doc-list { display:flex; flex-direction:column; gap:1px; background:var(--border); }
  .doc-item { background:var(--deep); padding:14px 20px; display:flex; align-items:center; justify-content:space-between; transition:background 0.2s; }
  .doc-item:hover { background:rgba(200,230,245,0.04); }
  .doc-name { font-size:0.7rem; color:var(--text); letter-spacing:0.03em; }
  .doc-status { font-size:0.55rem; letter-spacing:0.15em; text-transform:uppercase; padding:3px 10px; border-radius:2px; flex-shrink:0; }
  .doc-status.received    { color:#6ecfa0; background:rgba(110,207,160,0.08); border:1px solid rgba(110,207,160,0.2); }
  .doc-status.pending-doc { color:var(--brand-glow); background:rgba(74,174,247,0.08); border:1px solid rgba(74,174,247,0.2); }

  /* FOOTER */
  .crystal-accent { width:100%; height:1px; background:linear-gradient(90deg,transparent,var(--brand),var(--brand-glow),var(--brand),transparent); margin:40px 0; opacity:0.5; }
  .form-footer { display:flex; align-items:center; justify-content:space-between; padding-top:32px; border-top:1px solid var(--border); gap:24px; animation:fadeUp 0.6s ease 0.6s both; }
  .footer-note { font-size:0.55rem; color:var(--muted); letter-spacing:0.1em; line-height:1.9; max-width:400px; }
  .print-btn { display:inline-flex; align-items:center; gap:10px; padding:12px 24px; border:1px solid var(--border); border-radius:2px; background:var(--glass); color:var(--crystal); font-family:'DM Mono',monospace; font-size:0.6rem; letter-spacing:0.2em; text-transform:uppercase; cursor:pointer; transition:all 0.2s; white-space:nowrap; }
  .print-btn:hover { background:rgba(200,230,245,0.1); border-color:rgba(200,230,245,0.3); }

  @keyframes fadeDown { from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)} }
  @keyframes fadeUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes barGrow  { from{transform:scaleX(0)} to{transform:scaleX(1)} }

  @media print {
    body { background:white; color:#111; }
    body::before, body::after { display:none; }
    .glass-card { border:1px solid #ddd; }
    .print-btn { display:none; }
    .field-item, .stat-item, .doc-item { background:white; }
    .field-grid, .stat-row, .doc-list { background:#ddd; }
  }
</style>
</head>
<body>
<div class="page-wrapper">

  <!-- HEADER -->
  <div class="header">
    <div class="logo-area">
      <img class="logo-img" src="data:image/png;base64,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" alt="Crystal Capital Partners">
      <div class="logo-text">
        <div class="brand">Crystal Capital Partners</div>
        <div class="tagline">Business Funding Application</div>
      </div>
    </div>
    <div class="app-meta">
      <div class="app-id">Application #{{application_id}}</div>
      <div class="app-date">Submitted: {{submitted_date}}</div>
      <div class="status-badge"><span class="status-dot"></span>Submitted — Pending Review</div>
    </div>
  </div>


  <!-- ═══════════════════════════════════════
       01 · APPLICANT INFORMATION
       Fields: basic_first_name, basic_last_name, basic_email, basic_phone_number,
               basic_credit_score, owner_title, own_100percent, owner_birth, owner_ssn,
               owner_credit_score, monthly_mortage_payment_amount,
               owner_address, owner_address2, owner_city, owner_state, owner_zip
  ═══════════════════════════════════════ -->
  <div class="section-label" style="animation-delay:0s">
    <span class="num">01 /</span>
    <h2>Applicant Information</h2>
    <div class="line"></div>
  </div>

  <div class="glass-card d1">
    <div class="field-grid">

      <div class="field-item">
        <div class="field-label">First Name</div>
        <div class="field-value large">{{basic_first_name}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Last Name</div>
        <div class="field-value large">{{basic_last_name}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Email Address</div>
        <div class="field-value mono">{{basic_email}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Phone Number</div>
        <div class="field-value mono">{{basic_phone_number}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Title</div>
        <div class="field-value">{{owner_title}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">100% Owner?</div>
        <div class="field-value accent">{{own_100percent}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Date of Birth</div>
        <div class="field-value mono">{{owner_birth}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Social Security Number</div>
        <div class="field-value mono">{{owner_ssn}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Credit Score (Stated)</div>
        <div class="field-value accent">{{basic_credit_score}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Monthly Mortgage Payment</div>
        <div class="field-value mono">{{monthly_mortage_payment_amount}}</div>
      </div>

      <div class="field-item full">
        <div class="field-label">Home Address</div>
        <div class="field-value">{{owner_address}} {{owner_address2}} {{owner_city}}, {{owner_state}} {{owner_zip}}</div>
      </div>

    </div>

    <!-- Credit score bar -->
    <div class="score-section">
      <div style="flex:1">
        <div class="score-label">Owner Credit Score</div>
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:{{owner_credit_score_pct}}%;"></div>
        </div>
        <div class="score-range">
          <span>300</span><span>Poor</span><span>Fair</span><span>Good</span><span>Excellent</span><span>850</span>
        </div>
      </div>
      <div>
        <div class="score-value">{{owner_credit_score}}</div>
      </div>
    </div>
  </div>


  <!-- ═══════════════════════════════════════
       02 · BUSINESS INFORMATION
       Fields: basic_business_name, basic_business_type, basic_industry_parent,
               basic_industry_sub, basic_years_in_business, business_type, business_ein,
               business_count, ownership_start_date, website, business_description,
               bussiness_address, bussiness_address2, business_city, business_state,
               business_zip, location_rent_own, monthly_rent_payment_amount,
               landlord_contact_name, landlord_phone_number
  ═══════════════════════════════════════ -->
  <div class="section-label" style="animation-delay:0.08s">
    <span class="num">02 /</span>
    <h2>Business Information</h2>
    <div class="line"></div>
  </div>

  <div class="glass-card d2">
    <div class="field-grid">

      <div class="field-item">
        <div class="field-label">Legal Business Name</div>
        <div class="field-value large">{{basic_business_name}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Entity Type</div>
        <div class="field-value">{{basic_business_type}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Business EIN</div>
        <div class="field-value mono">{{business_ein}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Business Type</div>
        <div class="field-value">{{business_type}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Industry</div>
        <div class="field-value">{{basic_industry_parent}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Industry (Sub)</div>
        <div class="field-value">{{basic_industry_sub}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Years in Business</div>
        <div class="field-value">{{basic_years_in_business}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Employee Count</div>
        <div class="field-value">{{business_count}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Ownership Start Date</div>
        <div class="field-value mono">{{ownership_start_date}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Website</div>
        <div class="field-value mono">{{website}}</div>
      </div>

      <div class="field-item full">
        <div class="field-label">Business Address</div>
        <div class="field-value">{{bussiness_address}} {{bussiness_address2}} {{business_city}}, {{business_state}} {{business_zip}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Location</div>
        <div class="field-value">{{location_rent_own}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Monthly Rent</div>
        <div class="field-value mono">{{monthly_rent_payment_amount}}</div>
      </div>

      <div class="field-item">
        <div class="field-label">Landlord Contact</div>
        <div class="field-value">{{landlord_contact_name}}</div>
      </div>
      <div class="field-item">
        <div class="field-label">Landlord Phone</div>
        <div class="field-value mono">{{landlord_phone_number}}</div>
      </div>

      <div class="field-item full">
        <div class="field-label">Business Description</div>
        <div class="field-value" style="font-size:0.78rem;line-height:1.85;">{{business_description}}</div>
      </div>

    </div>
  </div>


  <!-- ═══════════════════════════════════════
       03 · FUNDING REQUEST
       Fields: basic_desired_amount, basic_last_3_months_avg_deposit_volume,
               basic_purpose_of_funding, basic_how_soon,
               mca_yes_no, approximate_existing_balance, with_which_company,
               monthlly_credit_card_volume
  ═══════════════════════════════════════ -->
  <div class="section-label" style="animation-delay:0.16s">
    <span class="num">03 /</span>
    <h2>Funding Request</h2>
    <div class="line"></div>
  </div>

  <div class="glass-card d3">

    <!-- Hero row -->
    <div class="funding-hero">
      <div class="funding-hero-inner">
        <div>
          <div class="field-label" style="margin-bottom:10px;">Requested Funding Amount</div>
          <div class="hero-amount">{{basic_desired_amount}}</div>
          <div class="hero-sub">USD · Business Loan</div>
        </div>
        <div class="hero-divider"></div>
        <div>
          <div class="field-label" style="margin-bottom:10px;">Applicant</div>
          <div class="hero-stat-val">{{basic_first_name}} {{basic_last_name}}</div>
          <div class="hero-stat-sub">{{basic_business_name}}</div>
        </div>
        <div class="hero-divider"></div>
        <div>
          <div class="field-label" style="margin-bottom:10px;">Submitted</div>
          <div class="hero-stat-val">{{submitted_date_short}}</div>
        </div>
      </div>
    </div>

    <!-- Revenue stats -->
    <div class="stat-row">
      <div class="stat-item">
        <div class="stat-label">Avg Monthly Revenue</div>
        <div class="stat-value positive">{{basic_last_3_months_avg_deposit_volume}}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Purpose of Funding</div>
        <div class="stat-value" style="font-size:1rem;line-height:1.3;">{{basic_purpose_of_funding}}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">How Soon Needed</div>
        <div class="stat-value" style="font-size:1rem;line-height:1.3;">{{basic_how_soon}}</div>
      </div>
    </div>

    <!-- MCA & credit card fields -->
    <div style="border-top:1px solid var(--border);">
      <div class="field-grid">

        <div class="field-item">
          <div class="field-label">Existing MCA?</div>
          <div class="field-value">{{mca_yes_no}}</div>
        </div>
        <div class="field-item">
          <div class="field-label">MCA Provider</div>
          <div class="field-value">{{with_which_company}}</div>
        </div>

        <div class="field-item">
          <div class="field-label">Approx. Existing MCA Balance</div>
          <div class="field-value mono">{{approximate_existing_balance}}</div>
        </div>
        <div class="field-item">
          <div class="field-label">Monthly Credit Card Volume</div>
          <div class="field-value mono">{{monthlly_credit_card_volume}}</div>
        </div>

        <!-- Signature -->
        <div class="field-item full">
          <div class="field-label">Applicant Signature</div>
          <div style="margin-top:8px;display:flex;align-items:flex-end;gap:40px;">
            <div style="flex:1;">
              <div style="height:56px;display:flex;align-items:flex-end;padding-bottom:10px;border-bottom:1px solid rgba(200,230,245,0.35);margin-bottom:8px;">
                <span style="font-family:'Cormorant Garamond',serif;font-size:1.6rem;font-weight:300;font-style:italic;color:var(--crystal);letter-spacing:0.04em;">{{signature}}</span>
              </div>
              <div style="font-size:0.5rem;letter-spacing:0.22em;color:var(--muted);text-transform:uppercase;">Signature</div>
            </div>
            <div style="width:200px;">
              <div style="height:56px;display:flex;align-items:flex-end;padding-bottom:10px;border-bottom:1px solid rgba(200,230,245,0.35);margin-bottom:8px;">
                <span style="font-size:0.83rem;color:var(--text);">{{signature_date}}</span>
              </div>
              <div style="font-size:0.5rem;letter-spacing:0.22em;color:var(--muted);text-transform:uppercase;">Date</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>


  <!-- ═══════════════════════════════════════
       04 · DOCUMENT CHECKLIST
       Fields: last4_bank_statement1-4, driver_license, voided_check
  ═══════════════════════════════════════ -->
  <div class="section-label" style="animation-delay:0.24s">
    <span class="num">04 /</span>
    <h2>Document Checklist</h2>
    <div class="line"></div>
  </div>

  <div class="glass-card d4">
    <div class="doc-list">
      <div class="doc-item">
        <span class="doc-name">3 Months Business Bank Statements (all pages)</span>
        <span class="doc-status {{bank_stmt_status}}">{{bank_stmt_label}}</span>
        <span style="display:none">{{last4_bank_statement1}}{{last4_bank_statement2}}{{last4_bank_statement3}}{{last4_bank_statement4}}</span>
      </div>
      <div class="doc-item">
        <span class="doc-name">Signed Business Funding Application</span>
        <span class="doc-status {{app_status}}">{{app_label}}</span>
      </div>
      <div class="doc-item">
        <span class="doc-name">Driver's License / Government-Issued ID</span>
        <span class="doc-status {{id_status}}">{{id_label}}</span>
        <span style="display:none">{{driver_license}}</span>
      </div>
      <div class="doc-item">
        <span class="doc-name">Voided Business Check</span>
        <span class="doc-status {{check_status}}">{{check_label}}</span>
        <span style="display:none">{{voided_check}}</span>
      </div>
    </div>
  </div>

  <div class="crystal-accent"></div>

  <!-- FOOTER -->
  <div class="form-footer">
    <div class="footer-note">
      This document is a preliminary output summary for internal and lender review.<br>
      It does not constitute a binding commitment to lend. All terms subject to final underwriting.<br>
      Crystal Capital Partners · crystalcapp.com · (424) 253-0536
    </div>
    <button class="print-btn" onclick="window.print()">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 6 2 18 2 18 9"/>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
      Print / Save PDF
    </button>
  </div>

</div>
</body>
</html>
`;
}

function getLenderTemplate() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Lender Copy — Crystal Capital Partners</title>
<style>
  @page { size: letter; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Helvetica, Arial, sans-serif; font-size:10pt; color:#2d2d2d; background:#fff; line-height:1.4; }
  table { border-collapse:collapse; width:100%; }
  td { vertical-align:top; }
  .page { width:8.5in; height:11in; position:relative; overflow:hidden; }

  /* ── HEADER BAR ── */
  .topbar { background:#0d2137; padding:20px 40px; }
  .topbar td { vertical-align:middle; }
  .logo { width:42px; height:42px; border-radius:6px; background:#fff; padding:3px; vertical-align:middle; }
  .brand { font-size:18pt; font-weight:700; color:#ffffff; letter-spacing:0.3px; padding-left:14px; vertical-align:middle; }
  .sub { font-size:7.5pt; color:#7da8c8; letter-spacing:2.5px; text-transform:uppercase; padding-left:14px; vertical-align:middle; }
  .meta-r { text-align:right; }
  .meta-id { font-size:7.5pt; font-weight:700; color:#7da8c8; letter-spacing:1px; }
  .meta-date { font-size:7.5pt; color:#5a8aaa; margin-top:2px; }
  .tag { display:inline-block; padding:3px 10px; font-size:6pt; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; border-radius:3px; margin-top:6px; }
  .tag-b { background:rgba(255,255,255,0.1); color:#7da8c8; }
  .tag-o { background:rgba(240,168,48,0.12); color:#e8a020; border:1px solid rgba(240,168,48,0.3); margin-left:5px; }

  /* ── CONTENT ── */
  .body { padding: 22px 40px 0 40px; }

  /* Section heading */
  .sh { margin-top:16px; margin-bottom:8px; padding-bottom:5px; border-bottom:2px solid #0d2137; }
  .sh-num { font-size:9pt; color:#7da8c8; font-weight:400; }
  .sh-txt { font-size:10pt; font-weight:700; color:#0d2137; text-transform:uppercase; letter-spacing:1px; }

  /* Data grid */
  .dg { border:1px solid #d4dce4; margin-bottom:0; }
  .dg td { border:1px solid #e8edf2; padding:8px 12px; }
  .dg tr:nth-child(even) td { background:#f5f8fa; }
  .lb { font-size:6.5pt; font-weight:600; color:#8898a8; text-transform:uppercase; letter-spacing:1.2px; margin-bottom:3px; }
  .v { font-size:10pt; color:#2d2d2d; }
  .v-name { font-size:13pt; font-weight:700; color:#0d2137; }
  .v-hi { font-size:10pt; font-weight:700; color:#0d2137; }
  .v-green { font-weight:700; color:#0a7a48; }
  .v-dim { color:#b8c4cc; font-size:9pt; letter-spacing:0.3px; }

  /* Funding hero */
  .hero td { background:#f0f5fa; border:1px solid #c8d8e8; padding:14px 16px; }
  .hero-amt { font-size:32pt; font-weight:700; color:#0d2137; letter-spacing:-1px; line-height:1; }
  .hero-sub { font-size:6.5pt; color:#8898a8; text-transform:uppercase; letter-spacing:1.5px; margin-top:4px; }
  .hero-label { font-size:6.5pt; font-weight:600; color:#8898a8; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; }
  .hero-val { font-size:14pt; font-weight:700; }

  /* Score */
  .bar-bg { height:6px; background:#e4eaf0; border-radius:3px; margin:4px 0; overflow:hidden; }
  .bar-fg { height:6px; background:linear-gradient(90deg,#1a5276,#2e86c1); border-radius:3px; }
  .bar-lb { font-size:5.5pt; color:#a0aab4; }
  .score-n { font-size:24pt; font-weight:700; color:#0d2137; line-height:1; }

  /* Signature */
  .sig-v { font-family:Georgia,serif; font-size:15pt; font-style:italic; color:#2d2d2d; }
  .sig-ln { border-bottom:1px solid #aaa; padding-bottom:5px; margin-bottom:3px; min-height:26px; }
  .sig-lb { font-size:5.5pt; color:#a0aab4; text-transform:uppercase; letter-spacing:1.5px; }

  /* Footer */
  .ftr { position:absolute; bottom:0; left:0; right:0; background:#f5f8fa; border-top:1px solid #d4dce4; padding:10px 40px; font-size:6.5pt; color:#a0aab4; line-height:1.6; }
</style>
</head>
<body>
<div class="page">

<!-- HEADER -->
<div class="topbar">
<table><tr>
  <td style="width:58%;">
    <img class="logo" src="data:image/png;base64,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" alt="CCP">
    <span class="brand">Crystal Capital Partners</span><br>
    <span class="sub" style="padding-left:60px;">Business Funding Application</span>
  </td>
  <td class="meta-r" style="width:42%;">
    <div class="meta-id">APPLICATION #{{application_id}}</div>
    <div class="meta-date">Submitted: {{submitted_date}}</div>
    <div><span class="tag tag-b">Pending Review</span><span class="tag tag-o">Lender Copy — PII Redacted</span></div>
  </td>
</tr></table>
</div>

<div class="body">

<!-- 01 APPLICANT -->
<div class="sh">
  <span class="sh-num">01 &nbsp;</span><span class="sh-txt">Applicant Information</span>
</div>
<table class="dg">
  <tr>
    <td style="width:22%;"><div class="lb">First Name</div><div class="v-name">{{basic_first_name}}</div></td>
    <td style="width:22%;"><div class="lb">Last Name</div><div class="v-name">{{basic_last_name}}</div></td>
    <td style="width:18%;"><div class="lb">Title</div><div class="v">{{owner_title}}</div></td>
    <td style="width:18%;"><div class="lb">100% Owner?</div><div class="v-hi">{{own_100percent}}</div></td>
    <td style="width:20%;"><div class="lb">Credit Score</div><div class="v-hi">{{basic_credit_score}}</div></td>
  </tr>
  <tr>
    <td><div class="lb">Date of Birth</div><div class="v">{{owner_birth}}</div></td>
    <td><div class="lb">SSN</div><div class="v">{{owner_ssn}}</div></td>
    <td><div class="lb">Monthly Mortgage</div><div class="v">{{monthly_mortage_payment_amount}}</div></td>
    <td><div class="lb">Email</div><div class="v-dim">██████@████.███</div></td>
    <td><div class="lb">Phone</div><div class="v-dim">(███) ███-████</div></td>
  </tr>
  <tr>
    <td colspan="3"><div class="lb">Home Address</div><div class="v">{{owner_address}} {{owner_address2}}, {{owner_city}}, {{owner_state}} {{owner_zip}}</div></td>
    <td colspan="2">
      <div class="lb">Owner Credit Score</div>
      <table><tr>
        <td style="width:60%;padding:0;">
          <div class="bar-bg"><div class="bar-fg" style="width:{{owner_credit_score_pct}}%;"></div></div>
          <table><tr>
            <td class="bar-lb" style="text-align:left;">300</td>
            <td class="bar-lb" style="text-align:center;">Fair</td>
            <td class="bar-lb" style="text-align:center;">Good</td>
            <td class="bar-lb" style="text-align:right;">850</td>
          </tr></table>
        </td>
        <td style="width:40%;padding:0 0 0 10px;text-align:right;vertical-align:middle;">
          <div class="score-n">{{owner_credit_score}}</div>
        </td>
      </tr></table>
    </td>
  </tr>
</table>

<!-- 02 BUSINESS -->
<div class="sh">
  <span class="sh-num">02 &nbsp;</span><span class="sh-txt">Business Information</span>
</div>
<table class="dg">
  <tr>
    <td style="width:28%;"><div class="lb">Legal Business Name</div><div class="v-name">{{basic_business_name}}</div></td>
    <td style="width:24%;"><div class="lb">Entity Type</div><div class="v">{{basic_business_type}}</div></td>
    <td style="width:24%;"><div class="lb">EIN</div><div class="v">{{business_ein}}</div></td>
    <td style="width:24%;"><div class="lb">Business Type</div><div class="v">{{business_type}}</div></td>
  </tr>
  <tr>
    <td><div class="lb">Industry</div><div class="v">{{basic_industry_parent}}</div></td>
    <td><div class="lb">Sub-Industry</div><div class="v">{{basic_industry_sub}}</div></td>
    <td><div class="lb">Years in Business</div><div class="v">{{basic_years_in_business}}</div></td>
    <td><div class="lb">Employees</div><div class="v">{{business_count}}</div></td>
  </tr>
  <tr>
    <td><div class="lb">Ownership Start</div><div class="v">{{ownership_start_date}}</div></td>
    <td><div class="lb">Website</div><div class="v">{{website}}</div></td>
    <td colspan="2"><div class="lb">Business Address</div><div class="v">{{bussiness_address}} {{bussiness_address2}}, {{business_city}}, {{business_state}} {{business_zip}}</div></td>
  </tr>
  <tr>
    <td><div class="lb">Location</div><div class="v">{{location_rent_own}}</div></td>
    <td><div class="lb">Monthly Rent</div><div class="v">{{monthly_rent_payment_amount}}</div></td>
    <td><div class="lb">Landlord</div><div class="v">{{landlord_contact_name}}</div></td>
    <td><div class="lb">Landlord Phone</div><div class="v-dim">(███) ███-████</div></td>
  </tr>
  <tr>
    <td colspan="4"><div class="lb">Business Description</div><div class="v" style="line-height:1.5;">{{business_description}}</div></td>
  </tr>
</table>

<!-- 03 FUNDING -->
<div class="sh">
  <span class="sh-num">03 &nbsp;</span><span class="sh-txt">Funding Request</span>
</div>
<table class="hero" style="margin-bottom:0;">
  <tr>
    <td style="width:36%; border-right:1px solid #c8d8e8;">
      <div class="hero-label">Requested Funding Amount</div>
      <div class="hero-amt">{{basic_desired_amount}}</div>
      <div class="hero-sub">USD &middot; Business Loan &middot; {{submitted_date_short}}</div>
    </td>
    <td style="width:22%; text-align:center; border-right:1px solid #c8d8e8;">
      <div class="hero-label">Avg Monthly Revenue</div>
      <div class="hero-val v-green" style="padding-top:6px;">{{basic_last_3_months_avg_deposit_volume}}</div>
    </td>
    <td style="width:22%; text-align:center; border-right:1px solid #c8d8e8;">
      <div class="hero-label">Purpose of Funding</div>
      <div class="v" style="padding-top:6px;font-weight:600;">{{basic_purpose_of_funding}}</div>
    </td>
    <td style="width:20%; text-align:center;">
      <div class="hero-label">How Soon Needed</div>
      <div class="v" style="padding-top:6px;font-weight:600;">{{basic_how_soon}}</div>
    </td>
  </tr>
</table>
<table class="dg">
  <tr>
    <td style="width:25%;"><div class="lb">Existing MCA?</div><div class="v">{{mca_yes_no}}</div></td>
    <td style="width:25%;"><div class="lb">MCA Provider</div><div class="v">{{with_which_company}}</div></td>
    <td style="width:25%;"><div class="lb">Existing MCA Balance</div><div class="v">{{approximate_existing_balance}}</div></td>
    <td style="width:25%;"><div class="lb">Monthly CC Volume</div><div class="v">{{monthlly_credit_card_volume}}</div></td>
  </tr>
  <tr>
    <td colspan="4" style="padding:10px 12px;">
      <div class="lb">Applicant Signature</div>
      <table style="margin-top:5px;"><tr>
        <td style="width:58%;padding-right:24px;">
          <div class="sig-ln"><span class="sig-v">{{signature}}</span></div>
          <div class="sig-lb">Signature</div>
        </td>
        <td style="width:42%;">
          <div class="sig-ln"><span class="v">{{signature_date}}</span></div>
          <div class="sig-lb">Date</div>
        </td>
      </tr></table>
    </td>
  </tr>
</table>

</div><!-- end body -->

<div class="ftr">
  This document is a redacted lender copy. Personal contact information has been removed.
  It does not constitute a binding commitment to lend. All terms subject to final underwriting.
  &nbsp;&middot;&nbsp; Crystal Capital Partners &nbsp;&middot;&nbsp; crystalcapp.com
</div>

</div>
</body>
</html>`;
}
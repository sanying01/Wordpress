/****************************************************
 * Script B — Secondary Webhook Consumer
 * Receives forwarded payloads from Script A
 ****************************************************/

const SHARED_SECRET = 'ccp_9f3c8a1d2b4e7f9c0a6d8e1b2c4f5a7d';

// Optional: where to store payload logs
const LOG_FOLDER_ID = '1Gg3caMFBM5P5A3ts75UiwjVUAu9Vb1RQ';

/**
 * Webhook receiver
 * Called ONLY by Script A
 */
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'Empty payload' }, 400);
    }

    const payload = JSON.parse(e.postData.contents);
    const secret = payload.second_shared_secret;

    if (secret !== SHARED_SECRET) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 403);
    }


    if (!payload.submission_id) {
      return jsonResponse(
        { success: false, error: 'Missing submission_id' },
        400
      );
    }

    // ── MAIN PROCESSING ──────────────────────────
    handlePayload(payload);

    return jsonResponse({
      success: true,
      message: 'Payload received by Script B',
      submission_id: payload.submission_id
    });

  } catch (err) {
    Logger.log(err);
    return jsonResponse(
      { success: false, error: err.toString() },
      500
    );
  }
}

/**
 * Optional health check
 */
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ok',
      service: 'Apps Script Project B',
      role: 'secondary consumer',
      time: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Core business logic for Script B
 * (independent from Script A)
 */
function handlePayload(payload) {
  Logger.log('Received submission: ' + payload.submission_id);

  // OPTION 1: Store last payload in Script Properties
  PropertiesService.getScriptProperties().setProperty(
    'last_payload',
    JSON.stringify(payload)
  );

  // OPTION 2: Save payload JSON to Drive
  if (LOG_FOLDER_ID) {
    const folder = DriveApp.getFolderById(LOG_FOLDER_ID);
    const fileName =
      'submission_' +
      payload.submission_id +
      '_' +
      Date.now() +
      '.json';

    folder.createFile(
      fileName,
      JSON.stringify(payload, null, 2),
      MimeType.PLAIN_TEXT
    );
  }

  // OPTION 3 (future):
  // - Send Slack notification
  // - Push to BigQuery
  // - Call CRM
  // - Analytics tracking
}

/**
 * JSON response helper
 */
function jsonResponse(obj, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
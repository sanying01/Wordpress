//I have added a column(status) in client_applications table of db.

//For option 1: pull only new submissions (get all data where status is null)
function fetchClientApplications() {
  const url = "https://crystalcapp.com/wp-json/api/v1/client-applications";
  const options = {
    method: "get",
    headers: { "crystalcapp-api-key": "9f3c8a1d2b4e7f9c0a6d8e1b2c4f5a7d9e0c1b2a3d4e5f6a7b8c9d0e1f2a" }
  };

  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());

  Logger.log(data);
}

//For option 2: push the accepted submissions (update the status of the selected data to "accepted")
function acceptSubmissions() {
    const url = "https://yourdomain.com/wp-json/api/v1/client-applications/accepted";
    const apiKey = "9f3c8a1d2b4e7f9c0a6d8e1b2c4f5a7d9e0c1b2a3d4e5f6a7b8c9d0e1f2a";
    const submissionIds = [
        "3d91cf1f-5064-4903-a4c6-27564292b1ab",
        "3d91cf1f-5064-4903-a4c6-27564292b1ab",
        "3d91cf1f-5064-4903-a4c6-27564292b1ab",
        "3d91cf1f-5064-4903-a4c6-27564292b1ab",
        "3d91cf1f-5064-4903-a4c6-27564292b1ab",
        "3d91cf1f-5064-4903-a4c6-27564292b1ab",
        "3d91cf1f-5064-4903-a4c6-27564292b1ab",
        "3d91cf1f-5064-4903-a4c6-27564292b1ab",
    ]; // Replace with actual IDs from option1
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "crystalcapp-api-key": apiKey
      },
      payload: JSON.stringify({
        submission_ids: submissionIds
      }),
      muteHttpExceptions: true
    };
  
    try {
      const response = UrlFetchApp.fetch(url, options);
      const result = JSON.parse(response.getContentText());
  
      if (result.success) {
        Logger.log("Status updated successfully!");
        Logger.log("Updated count: " + result.updated_count);
        Logger.log("Submission IDs: " + result.submission_ids.join(", "));
      } else {
        Logger.log("Failed: " + JSON.stringify(result));
      }
    } catch (e) {
      Logger.log("Error: " + e.message);
    }
  }

  function acceptSubmissions(submissionIds) {
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "crystalcapp-api-key": WP_API_KEY
      },
      payload: JSON.stringify({
        submission_ids: submissionIds
      }),
      muteHttpExceptions: true
    };
  
    try {
      const response = UrlFetchApp.fetch(WP_PUSH_API_URL, options);
      const result = JSON.parse(response.getContentText());
  
      if (result.success) {
        Logger.log("Status updated successfully!");
        Logger.log("Updated count: " + result.updated_count);
        Logger.log("Submission IDs: " + result.submission_ids.join(", "));
      } else {
        Logger.log("Failed: " + JSON.stringify(result));
      }
    } catch (e) {
      Logger.log("Error: " + e.message);
    }
  }
  
const {google} = require('googleapis')
const fs = require('fs')
const path = require('path')

const authClient = new google.auth.JWT({
  email: process.env.SERVICE_ACCOUNT_EMAIL,
  key: fs.readFileSync(path.join(__dirname, "key.pem"), 'utf8'),
  scopes: ['https://www.googleapis.com/auth/analytics.readonly']
})

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type"
}

const queryParams = {
  resource: {
    reportRequests: [
      {
        viewId: process.env.VIEW_ID,
        dateRanges: [{startDate: '30daysAgo', endDate: 'yesterday'}],
        metrics: [
          {expression: 'ga:pageviews'},
          {expression: 'ga:exits'}
        ],
        dimensions: [
          {name: 'ga:previousPagePath'},
          {name: 'ga:pagePath'}
        ],
        orderBys: [
          {fieldName: 'ga:previousPagePath', sortOrder: 'ASCENDING'},
          {fieldName: 'ga:pageviews', sortOrder: 'DESCENDING'}
        ],
        pageSize: 10000
      }
    ]
  }
}


exports.handler = async (event, context, callback) => {
  try {
    await authClient.authorize()
    const analytics = google.analyticsreporting({
      version: 'v4',
      auth: authClient
    })
    const response = await analytics.reports.batchGet(queryParams)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        status: err
      })
    }
  }
}

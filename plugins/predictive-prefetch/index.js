const {google} = require('googleapis')
require('dotenv').config();

const {
  SERVICE_ACCOUNT_EMAIL,
  GA_PRIVATE_KEY
} = process.env

module.exports = {
  name: 'netlify-plugin-predictive-prefetch',
  init: async ({ pluginConfig }) => {
    const authClient = new google.auth.JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: GA_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    })
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
    try {
      await authClient.authorize()
      const analytics = google.analyticsreporting({
        version: 'v4',
        auth: authClient
      })
      const response = await analytics.reports.batchGet(queryParams)
      console.log(response)
    } catch(e) {
      console.log(e)
    }
  },
}
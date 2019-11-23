const {google} = require('googleapis')
const fs = require('fs')
const path = require('path')

const authClient = new google.auth.JWT({
  email: process.env.SERVICE_ACCOUNT_EMAIL,
  key: fs.readFileSync(path.join(__dirname, "../../key1.pem"), 'utf8'),
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
    let [report] = response.data.reports

    let {rows} = report.data

    const data = {}
  
  for (let row of rows) {
    let [previousPagePath, pagePath] = row.dimensions
    let pageviews = +row.metrics[0].values[0]
    let exits = +row.metrics[0].values[1]

    if (/\?.*$/.test(pagePath) || /\?.*$/.test(previousPagePath)) {
      pagePath = pagePath.replace(/\?.*$/, '')
      previousPagePath = previousPagePath.replace(/\?.*$/, '')
    }

    // Ignore pageviews where the current and previous pages are the same.
    if (previousPagePath == pagePath) continue

    if (previousPagePath != '(entrance)') {
      data[previousPagePath] = data[previousPagePath] || {
        pagePath: previousPagePath,
        pageviews: 0,
        exits: 0,
        nextPageviews: 0,
        nextExits: 0,
        nextPages: {}
      }

      data[previousPagePath].nextPageviews += pageviews
      data[previousPagePath].nextExits += exits

      if (data[previousPagePath].nextPages[pagePath]) {
        data[previousPagePath].nextPages[pagePath] += pageviews
      } else {
        data[previousPagePath].nextPages[pagePath] = pageviews
      }
    }

    data[pagePath] = data[pagePath] || {
      pagePath: pagePath,
      pageviews: 0,
      exits: 0,
      nextPageviews: 0,
      nextExits: 0,
      nextPages: {}
    }

    data[pagePath].pageviews += pageviews
    data[pagePath].exits += exits
  }
    // Converts each pages `nextPages` object into a sorted array.
  Object.keys(data).forEach((pagePath) => {
    const page = data[pagePath]
    page.nextPages = Object.keys(page.nextPages)
      .map((pagePath) => ({
        pagePath,
        pageviews: page.nextPages[pagePath]
      }))
      .sort((a, b) => {
        return b.pageviews - a.pageviews
      })
  })
      // Creates a sorted array of pages from the data object.
  const pages = Object.keys(data)
    .filter((pagePath) => data[pagePath].nextPageviews > 0)
    .map((pagePath) => {
      const page = data[pagePath]
      const {exits, nextPageviews, nextPages} = page
      page.percentExits = exits / (exits + nextPageviews)
      page.topNextPageProbability =
        nextPages[0].pageviews / (exits + nextPageviews)
      return page
    })
    .sort((a, b) => {
      return b.pageviews - a.pageviews
    })
  
  const aggregatePages = async (pages) => {
    const predictions = []
    for (let page of pages) {
      const prediction = {
        pagePath: page.pagePath,
        nextPagePath: page.nextPages[0] ? page.nextPages[0].pagePath : '',
        nextPageCertainty: page.nextPages[0] ? page.topNextPageProbability : ''
      }
      predictions.push(prediction)
    }
    return predictions
  }

  const aggPages = await aggregatePages(pages);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(aggPages)
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

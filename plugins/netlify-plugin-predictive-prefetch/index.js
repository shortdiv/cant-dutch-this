const fs = require('fs')
const path = require('path')
const {google} = require('googleapis')
require('dotenv').config();

const {
  SERVICE_ACCOUNT_EMAIL,
  GA_PRIVATE_KEY
} = process.env

const aggregateData = (rows) => {
  let data = {}
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

  return pages
}

const makePrediction = async (pages) => {
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

module.exports = {
  name: 'netlify-plugin-predictive-prefetch',
  init: async ({ constants }) => {
    // fs.readdir(constants.BUILD_DIR, (err, paths) => {
    //   console.log(paths)
    //   if (err) console.log(`Unable to scan directory: ${err}`)
    //   for (let route of paths) {
    //     var stat = fs.lstatSync(path.join(constants.BUILD_DIR, route))
    //     if(stat.isDirectory()) {
    //       fs.readdir(path.join(constants.BUILD_DIR, route), (err, file) => {
    //         console.log(route)
            
    //       })
    //     }
    //   }
    // })

    let buff = Buffer.from(process.env.GA_PRIVATE_KEY, 'base64');
    buff = buff.toString() 

    const authClient = new google.auth.JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: buff,
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
      let [report] = response.data.reports
      let {rows} = report.data
      
      const cleanedData = aggregateData(rows)
      const predictions = await makePrediction(cleanedData)
      
      for (let i=0; i<predictions.length; i++) {
        let route = predictions[i].pagePath
        const r = path.join(constants.BUILD_DIR, route)
        if (fs.existsSync(r)) {
          let htmlString = fs.readFileSync(`${r}index.html`, 'utf8')
          var head = htmlString.match(/<\/head>/gi);
          htmlString = htmlString.replace(head, `<link rel=\"prefetch\" href=\"${predictions[i].nextPagePath}\"></head>`)
          console.log(htmlString)
          fs.writeFileSync(`${r}index.html`, htmlString, err => {
            if (err) throw err
            console.log("file written")
          })
        }
        
        
        // if (`${r}index.html`) {
        //   let data = fs.readFileSync(`${r}index.html`, 'utf8')
        //   console.log(data)
        // }
        
        // fs.readdir(constants.BUILD_DIR, (err, paths) => {
        //   console.log(paths)
        //   if (err) console.log(`Unable to scan directory: ${err}`)
          // for (let route of paths) {
          //   var stat = fs.lstatSync(path.join(constants.BUILD_DIR, route))
          //   if(stat.isDirectory()) {
          //     fs.readdir(path.join(constants.BUILD_DIR, route), (err, file) => {
          //       console.log(route)
                
          //     })
            // }
          // }
        // })
      }

      
      //write to files//

    } catch(e) {
      console.log(e)
    }
  },
}
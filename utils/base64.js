'use strict';
const fs = require('fs');
const path = require('path')

let data = fs.readFileSync(path.join(__dirname, "./key1.pem"), 'utf8');
let encodedData = Buffer.from(data).toString('base64')

fs.appendFile(".env", `GA_PRIVATE_KEY=${encodedData}`, function(err){
  if(err) throw err;
  console.log('IS WRITTEN')
});

// console.log('Image converted to base 64 is:\n\n' + base64data);
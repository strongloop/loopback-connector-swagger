// Copyright IBM Corp. 2017,2019. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const fs = require('fs');
const loopback = require('loopback');
const path = require('path');
const yaml = require('js-yaml');

const app = loopback({localRegistry: true});
module.exports = app;

const specFile = path.join(__dirname, 'echo-service.yaml');
const spec = yaml.safeLoad(fs.readFileSync(specFile));

app.get('/swagger', (req, res) => res.json(spec));
app.get('/echo', (req, res) => res.json({
  message: req.query.message || 'Hello World!',
  language: req.headers['accept-language'] || 'en',
  timestamp: now(),
}));

app.post('/uids', (req, res) => res.json({id: String(now())}));

function now() {
  const tick = process.hrtime();
  return tick[0] * 1e9 + tick[1];
}

if (require.main === module) {
  app.listen(4000, () => {
    console.log('Listening at http://127.0.0.1:4000/');
  });
}

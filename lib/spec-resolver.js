// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const SwaggerParser = require('swagger-parser');

const parser = new SwaggerParser();

exports.resolve = function resolveSpec(spec, options, cb) {
  if (typeof options === 'function' && !cb) {
    cb = options;
  }
  options = Object.assign({validate: {schema: false, spec: false}}, options);
  return parser.validate(spec, options, cb);
};

exports.validate = function validateSpec(spec, cb) {
  return parser.validate(spec, {validate: {spec: true, schema: true}}, cb);
};

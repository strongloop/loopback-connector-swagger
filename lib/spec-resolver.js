'use strict';

var fs = require('fs');
var path = require('path');
var url = require('url');
var YAML = require('js-yaml');
var SwaggerParser = require('swagger-parser');

exports.resolveSpec = function resolveSpec(connector, cb) {
  var self = connector;
  if (typeof self.spec === 'object') {
    process.nextTick(function() {
      cb(null, self);
    });
    return;
  }

  if (typeof self.spec === 'string') {
    var spec = url.parse(self.spec);

    if (spec.host) {
      self.url = self.spec;
      self.spec = null;
      process.nextTick(function() {
        cb(null, self);
      });
      return;
    }

    // check for .json or .yaml, read the spec file and parse spec object
    var parsedPath = path.parse(self.spec);
    // TODO: @gunjpan: resolve the path against project root instead of cwd
    var specPath = path.resolve(process.cwd(), self.spec);

    switch (parsedPath.ext) {
      case '.json':
        fs.readFile(specPath, function(err, data) {
          if (err) return cb(err, null);
          self.spec = JSON.parse(data);
          cb(null, self);
        });
        break;

      case '.yaml':
      case '.yml':
        fs.readFile(specPath, 'utf8', function(err, data) {
          if (err) return cb(err, null);
          try {
            self.spec = YAML.safeLoad(data);
            cb(null, self);
          } catch (err) {
            cb(err, null);
          }
        });
        break;

      default:
        cb(new Error('Invalid specification file type.'), null);
    }
  } else {
    process.nextTick(function() {
      cb(new Error('Invalid swagger specification type'), null);
    });
  }
};

exports.validateSpec = function validateSpec(spec, cb) {
  SwaggerParser.validate(spec, cb);
};

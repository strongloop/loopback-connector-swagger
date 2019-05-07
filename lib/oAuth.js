// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var url = require('url');

var AccessTokenAuthorization =
  module.exports.AccessTokenAuthorization =
  function(name, token, type) {
    this.name = name;
    this.token = token;
    this.type = type;
  };

AccessTokenAuthorization.prototype.apply = function(obj) {
  if (this.type === 'query') {
    var accessToken = 'access_token';
    var parsedUrl = url.parse(obj.url, true); // parse query string
    var qp = parsedUrl.query;

    if (isEmpty(qp)) {
      obj.url = obj.url + '?' + accessToken + '=' + this.token;
      return true;
    } else {
      if (accessToken in qp) {
        // skip it as already present
        return false;
      }
      obj.url = obj.url + '&' + accessToken + '=' + this.token;
      return true;
    }
  } else { // use headers by-default
    var bearer = 'Bearer ' + this.token;
    var authHeader = getAuthHeader(obj.headers);
    if (!authHeader) {
      obj.headers['Authorization'] = bearer;
    } else if (obj.headers[authHeader].length === 0) {
      obj.headers[authHeader] = bearer;
    } else { // other Authorization header is present, skip it
      return false;
    }
  }
};

function isEmpty(obj) {
  return (obj == null || Object.keys(obj).length === 0);
}

function getAuthHeader(headers) {
  var authReg = new RegExp('authorization', 'i');
  for (var h in headers) {
    if (h.match(authReg)) {
      return h;
    }
  }
  return false;
}

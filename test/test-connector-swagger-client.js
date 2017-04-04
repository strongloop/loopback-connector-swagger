// Copyright IBM Corp. 2016,2017. All Rights Reserved.
// Node module: loopback
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var should = require('should');
var loopback = require('loopback');
var http = require('http');

function getMySwaggerClient() {
  return {
    execute: function(requestObject) {
      if (requestObject.method === 'GET') {
        http.get(requestObject.url, function(response) {
          var body = '';
          response.on('data', function(d) {
            body += d;
          });
          response.on('end', function() {
            var parsed = JSON.parse(body);
            requestObject.on.response(parsed);
          });
        }).on('error', function(e) {
          requestObject.on.error('{\'error\': ' +
            '\'Test Client Error in getting response\'}');
        });
      }
    },
  };
};

describe('swagger client', function() {
  describe('swagger connector validation with and w/o custom swagger client',
    function() {
      it('invoke a get call in pet service using custom swagger client',
        function(done) {
          var ds = createDataSource(
            'test/fixtures/petStore.json', getMySwaggerClient());
          ds.on('connected', function() {
            var PetService = ds.createModel('PetService', {});
            PetService.getPetById({petId: 7}, function(err, res) {
              should.not.exist(err);
              // test client provides data parsed as json
              res.id.should.eql(7);
              done();
            });
          });
        });

      it('invoke a get call in pet service',
        function(done) {
          var ds = createDataSource('test/fixtures/petStore.json');
          ds.on('connected', function() {
            var PetService = ds.createModel('PetService', {});
            PetService.getPetById({petId: 7}, function(err, res) {
              should.not.exist(err);
              // parse the response data
              JSON.parse(res.data).id.should.eql(7);
              done();
            });
          });
        });
    });
});

function createDataSource(spec, mySwaggerClient) {
  return loopback.createDataSource('swagger', {
    connector: require('../index'),
    spec: spec,
    swaggerClient: mySwaggerClient || false,
  });
}

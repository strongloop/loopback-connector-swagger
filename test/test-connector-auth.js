// Copyright IBM Corp. 2016,2018. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

// eslint-disable-next-line no-unused
/* eslint-disable camelcase */
const should = require('should');
const loopback = require('loopback');

describe('Swagger connector - security', function() {
  const url = 'http://petstore.swagger.io/v2/pet/';

  describe('Basic auth', function() {
    it('supports basic auth', function(done) {
      givenDataSource(
        'test/fixtures/2.0/petstore.json',
        {
          basic: {
            username: 'aaabbbccc',
            password: 'header',
          },
        },
        (err, req) => {
          const auth = req.headers.authorization.split(' ');
          req.headers.should.have.property('authorization');
          auth[0].should.equal('Basic');
          done();
        },
      );
    });
  });

  describe('apiKey auth', function() {
    it('supports apiKey - in query', function(done) {
      givenDataSource(
        'test/fixtures/2.0/petstore.json',
        {
          api_key_query: 'abc12',
        },
        (err, req) => {
          req.url.should.equal(url + '1?api_key=abc12');
          done();
        },
      );
    });

    it('supports apiKey - in header', function(done) {
      givenDataSource(
        'test/fixtures/2.0/petstore.json',
        {
          api_key: 'abc12',
        },
        (err, req) => {
          req.url.should.equal(url + '1');
          req.headers.api_key.should.equal('abc12');
          done();
        },
      );
    });
  });

  describe('oAuth2', function() {
    it('supports oauth2 - in header', function(done) {
      givenDataSource(
        'test/fixtures/2.0/petstore.json',
        {
          petstore_auth: {
            token: {
              access_token: 'abc123abc',
            },
          },
        },
        (err, req) => {
          req.headers.should.have.property('authorization');
          req.headers.authorization.should.equal('Bearer abc123abc');
          done();
        },
      );
    });

    it('supports oauth2 with token_type', function(done) {
      givenDataSource(
        'test/fixtures/2.0/petstore.json',
        {
          'x-auth': {
            token: {
              access_token: 'abc123abc',
              token_type: 'JWT',
            },
          },
        },
        (err, req) => {
          req.headers.should.have.property('authorization');
          req.headers.authorization.should.equal('JWT abc123abc');
          done();
        },
      );
    });
  });
});

function givenDataSource(spec, authz, done) {
  const ds = loopback.createDataSource('swagger', {
    connector: require('../index'),
    spec: spec,
    authorizations: authz || {},
  });
  ds.on('connected', function() {
    ds.connector.observe('before execute', (ctx, next) => {
      done(null, ctx.req);
    });
    const PetService = ds.createModel('PetService', {});
    PetService.getPetById({petId: 1});
  });
  return ds;
}

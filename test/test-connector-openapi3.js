// Copyright IBM Corp. 2016,2018. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('assert');
const should = require('should');
const loopback = require('loopback');

describe('swagger connector for OpenApi 3.0', function() {
  describe('openapi spec validation against Swagger 3.0 specification', function() {
    it('when opted validates openapi spec: invalid spec', function(done) {
      const dsErrorProne = createDataSource(
        {openapi: '3.0.0'},
        {validate: false},
      );
      dsErrorProne.on('error', function(err) {
        should.exist(err);
        done();
      });
    });

    it('when opted validates openapi spec: valid spec', function(done) {
      const ds = createDataSource('http://127.0.0.1:3000/openapi.json');
      ds.on('connected', function() {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });
  });

  describe('openapi client generation', function() {
    it('generates client from openapi spec url', function(done) {
      const ds = createDataSource('http://127.0.0.1:3000/openapi.json');
      ds.on('connected', function() {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });

    it('generates client from local openapi spec - .json file', function(done) {
      const ds = createDataSource('test/fixtures/3.0/ping.json');
      ds.on('connected', function() {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });

    it('generates client from local openapi spec - .yaml file', function(done) {
      const ds = createDataSource('test/fixtures/3.0/ping.yaml');
      ds.on('connected', function() {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });

    it('generates client from openapi spec object', function(done) {
      const ds = createDataSource(require('./fixtures/3.0/ping.json'));
      ds.on('connected', function() {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });
  });

  describe('models', function() {
    describe('models without remotingEnabled', function() {
      let ds;
      before(function(done) {
        ds = createDataSource('test/fixtures/3.0/ping.json');
        ds.on('connected', function() {
          done();
        });
      });

      it('creates models', function(done) {
        const PingService = ds.createModel('PingService', {});
        (typeof PingService.get_ping).should.eql('function');
        done();
      });

      it('supports model methods', function(done) {
        const PingService = ds.createModel('PingService', {});
        PingService.get_ping({}, function(err, res) {
          if (err) return done(err);
          res.status.should.eql(200);
          done();
        });
      });

      it('supports model methods returning a Promise', done => {
        const PingService = ds.createModel('PingService', {});
        PingService.get_ping({}).then(function onSuccess(res) {
          res.should.have.property('status', 200);
          done();
        }, /* on error */ done);
      });
    });

    it('allows models to be attached before the spec is loaded', done => {
      const ds = createDataSource('test/fixtures/3.0/ping.json');
      const PingService = ds.createModel('PingService', {});

      ds.once('connected', () => {
        should(Object.keys(PingService)).containEql('get_ping');
        should(typeof PingService.get_ping).eql('function');
        done();
      });
    });
  });

  describe('Swagger invocations', function() {
    let ds, PingService;

    before(function(done) {
      ds = createDataSource('test/fixtures/3.0/ping.json');
      ds.on('connected', function() {
        PingService = ds.createModel('PingService', {});
        done();
      });
    });

    it('invokes the PingService', function(done) {
      PingService.get_ping({}, function(err, res) {
        if (err) return done(err);
        res.status.should.eql(200);
        res.body.should.containEql({
          greeting: 'Hello from LoopBack',
          url: '/ping',
        });
        res.body.headers.should.containEql({
          'user-agent': 'loopback-connector-swagger/3.2.1',
        });
        done();
      });
    });

    it('invokes the GreetService', function(done) {
      PingService.post_greet(
        {
          name: 'John',
        },
        {
          requestBody: {
            requestId: '001',
          },
        },
        function(err, res) {
          if (err) return done(err);
          res.status.should.eql(200);
          res.body.should.eql({hello: 'John', requestId: '001'});
          done();
        },
      );
    });

    it('invokes connector-hooks', function(done) {
      const events = [];
      const connector = ds.connector;
      connector.observe('before execute', function(ctx, next) {
        assert(ctx.req);
        events.push('before execute');
        next();
      });
      connector.observe('after execute', function(ctx, next) {
        assert(ctx.res);
        events.push('after execute');
        next();
      });
      PingService.get_ping({}, function(err, response) {
        assert.deepEqual(events, ['before execute', 'after execute']);
        done();
      });
    });

    it('supports Promise-based connector-hooks', done => {
      const events = [];
      const connector = ds.connector;

      connector.observe('before execute', ctx => {
        events.push('before execute');
        return Promise.resolve();
      });

      connector.observe('after execute', ctx => {
        events.push('after execute');
        return Promise.resolve();
      });

      PingService.get_ping({}, function(err, response) {
        assert.deepEqual(events, ['before execute', 'after execute']);
        done();
      });
    });
  });
});

function createDataSource(spec, options) {
  const config = Object.assign(
    {
      connector: require('../index'),
      spec: spec,
    },
    options,
  );
  return loopback.createDataSource('openapi', config);
}

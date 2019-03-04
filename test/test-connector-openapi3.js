// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('assert');
const should = require('should');
const loopback = require('loopback');

describe('swagger connector for OpenApi 3.0', () => {
  let lb4App;
  let specUrl = 'http://127.0.0.1:3000/openapi.json';

  before(startLB4App);
  after(stopLB4App);

  describe('openapi spec validation against Swagger 3.0 specification', () => {
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
      const ds = createDataSource(specUrl);
      ds.on('connected', () => {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });
  });

  describe('openapi client generation', () => {
    it('generates client from openapi spec url', function(done) {
      const ds = createDataSource(specUrl);
      ds.on('connected', () => {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });

    it('generates client from local openapi spec - .json file', function(done) {
      const ds = createDataSource('test/fixtures/3.0/ping.json');
      ds.on('connected', () => {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });

    it('generates client from local openapi spec - .yaml file', function(done) {
      const ds = createDataSource('test/fixtures/3.0/ping.yaml');
      ds.on('connected', () => {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });

    it('generates client from openapi spec object', function(done) {
      const ds = createDataSource(require('./fixtures/3.0/ping.json'));
      ds.on('connected', () => {
        ds.connector.should.have.property('client');
        ds.connector.client.should.have.property('apis');
        done();
      });
    });
  });

  describe('models', () => {
    describe('models without remotingEnabled', () => {
      let ds;
      before(function(done) {
        ds = createDataSource(specUrl);
        ds.on('connected', () => {
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

  describe('Swagger invocations', () => {
    let ds, PingService;

    before(function(done) {
      ds = createDataSource(specUrl);
      ds.on('connected', () => {
        PingService = ds.createModel('PingService', {});
        done();
      });
    });

    it('invokes the PingService', async () => {
      const res = await PingService.get_ping({});
      res.status.should.eql(200);
      res.body.should.containEql({
        greeting: 'Hello from LoopBack',
        url: '/ping',
      });
      res.body.headers.should.containEql({
        'user-agent': 'loopback-connector-swagger/3.2.1',
      });
    });

    it('invokes the GreetService', async () => {
      const res = await PingService.post_greet(
        {
          name: 'John',
        },
        {
          requestBody: {
            requestId: '001',
          },
        },
      );

      res.status.should.eql(200);
      res.body.should.eql({hello: 'John', requestId: '001'});
    });

    it('invokes connector-hooks', async () => {
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
      await PingService.get_ping({});
      assert.deepEqual(events, ['before execute', 'after execute']);
    });

    it('supports Promise-based connector-hooks', async () => {
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

      await PingService.get_ping({});
      assert.deepEqual(events, ['before execute', 'after execute']);
    });
  });

  async function startLB4App() {
    const pingApp = require('./fixtures/lb4-ping-app/index.js');
    const config = {
      rest: {
        port: 0,
        host: '127.0.0.1',
        openApiSpec: {
          // useful when used with OASGraph to locate your application
          setServersFromRequest: true,
        },
      },
    };
    lb4App = await pingApp.main(config);
    specUrl = `${lb4App.restServer.url}/openapi.json`;
    console.log(lb4App.restServer.url);
  }

  async function stopLB4App() {
    if (lb4App) {
      await lb4App.stop();
    }
  }
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

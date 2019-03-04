// Copyright IBM Corp. 2016,2018. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const promisify = require('util').promisify;
const echoService = require('./fixtures/lb3-echo/echo-service');
const loopback = require('loopback');
const should = require('should/as-function');

const CACHE_TTL = 100; // milliseconds

describe('swagger connector with caching', () => {
  let app, server, echoUrl, EchoClient, Cache;
  before(setupEchoService);
  after(closeServer);

  beforeEach(setupApp);
  beforeEach(setupClientModel);
  beforeEach(setupCache);

  it('returns fresh data on the first request', async () => {
    const res = await EchoClient.echo({
      message: 'hello',
      'accept-language': 'en',
    });
    should(res).have.property('status', 200);
    should(res.obj).containDeep({
      message: 'hello',
      language: 'en',
    });
  });

  it('returns cached data on the second request', async () => {
    const first = await EchoClient.echo();
    const second = await EchoClient.echo();
    should(first).deepEqual(second);
  });

  it('includes query parameters in the cache key', async () => {
    await EchoClient.echo({message: 'one'});
    const second = await EchoClient.echo({message: 'second'});
    should(second.body).containDeep({message: 'second'});
  });

  it('includes header parameters in the cache key', async () => {
    await EchoClient.echo({'Accept-Language': 'en'});
    const second = await EchoClient.echo({'Accept-Language': 'cs'});
    should(second.body).containDeep({language: 'cs'});
  });

  it('does not cache non-GET requests', async () => {
    const first = await EchoClient.createId();
    const second = await EchoClient.createId();
    should(second.obj.id).not.equal(first.obj.id);
  });

  it('honours TTL setting', async () => {
    const first = await EchoClient.echo();
    await promisify(setTimeout)(2 * CACHE_TTL);
    const second = await EchoClient.echo();
    should(second.obj.timestamp).not.equal(first.obj.timestamp);
  });

  function setupEchoService(done) {
    server = echoService
      .listen(0, function() {
        echoUrl = 'http://127.0.0.1:' + this.address().port;
        done();
      })
      .once('error', done);
  }

  function closeServer(done) {
    server.close(done);
  }

  function setupApp() {
    app = loopback({localRegistry: true, loadBuiltinModels: true});
  }

  function setupCache(done) {
    const ds = app.dataSource('echo-cache', {connector: 'kv-memory'});
    Cache = app.registry.createModel({
      name: 'EchoCache',
      base: 'KeyValueModel',
    });
    app.model(Cache, {dataSource: 'echo-cache'});
    waitForDsConnect(ds, done);
  }

  function setupClientModel(done) {
    const ds = app.dataSource('echo-service', {
      connector: require('../index'),
      url: echoUrl,
      spec: echoUrl + '/swagger',
      validate: false,
      cache: {
        model: 'EchoCache',
        ttl: CACHE_TTL,
      },
    });
    EchoClient = app.registry.createModel({
      name: 'Echo',
      base: 'Model',
    });
    app.model(EchoClient, {dataSource: 'echo-service'});
    waitForDsConnect(ds, done);
  }

  function waitForDsConnect(ds, done) {
    ds.once('connected', () => done());
    ds.once('error', done);
  }
});

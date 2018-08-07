// Copyright IBM Corp. 2016,2018. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const echoService = require('./fixtures/echo-service');
const loopback = require('loopback');
const Promise = require('bluebird');
const should = require('should/as-function');

const CACHE_TTL = 100; // milliseconds

describe('swagger connector with caching', () => {
  let app, echoUrl, EchoClient, Cache;
  beforeEach(setupEchoService);
  beforeEach(setupApp);
  beforeEach(setupClientModel);
  beforeEach(setupCache);

  it('returns fresh data on the first request', () => {
    return EchoClient.echo({
      message: 'hello',
      'accept-language': 'en',
    }).then(res => {
      should(res).have.property('status', 200);
      should(res.obj).containDeep({
        'message': 'hello',
        'language': 'en',
      });
    });
  });

  it('returns cached data on the second request', () => {
    return EchoClient.echo()
      .then(first => EchoClient.echo().then(second => [first, second]))
      .spread((first, second) => {
        should(first).deepEqual(second);
      });
  });

  it('includes query parameters in the cache key', () => {
    return EchoClient.echo({message: 'one'})
      .then(() => EchoClient.echo({message: 'second'}))
      .then(res => {
        should(res.obj).containDeep({message: 'second'});
      });
  });

  it('includes header parameters in the cache key', () => {
    return EchoClient.echo({'accept-language': 'en'})
      .then(() => EchoClient.echo({'accept-language': 'cs'}))
      .then(res => {
        should(res.obj).containDeep({language: 'cs'});
      });
  });

  it('does not cache non-GET requests', () => {
    return EchoClient.createId()
      .then(first => EchoClient.createId().then(second => [first, second]))
      .spread((first, second) => {
        should(second.obj.id).not.equal(first.obj.id);
      });
  });

  it('honours TTL setting', () => {
    let first;
    return EchoClient.echo()
      .then(r => first = r)
      .delay(2 * CACHE_TTL)
      .then(() => EchoClient.echo())
      .then(second => {
        should(second.obj.timestamp).not.equal(first.obj.timestamp);
      });
  });

  function setupEchoService(done) {
    echoService
      .listen(0, function() {
        echoUrl = 'http://127.0.0.1:' + this.address().port;
        done();
      })
      .once('error', done);
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
      spec: echoUrl + '/swagger',
      validate: true,
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

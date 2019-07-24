// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('assert');
const should = require('should');
const loopback = require('loopback');

describe('swagger connector', function() {
  describe('swagger spec validatation against Swagger 2.0 specification',
    function() {
      it('when opted validates swagger spec: invalid spec',
        function(done) {
          const dsErrorProne =
            createDataSource({'swagger': {'version': '2.0'}}, {validate: true});
          dsErrorProne.on('error', function(err) {
            should.exist(err);
            done();
          });
        });

      it('when opted validates swagger spec: valid spec',
        function(done) {
          const ds = createDataSource('http://petstore.swagger.io/v2/swagger.json');
          ds.on('connected', function() {
            ds.connector.should.have.property('client');
            ds.connector.client.should.have.property('apis');
            done();
          });
        });
    });

  describe('swagger client generation', function() {
    it('generates client from swagger spec url',
      function(done) {
        const ds = createDataSource('http://petstore.swagger.io/v2/swagger.json');
        ds.on('connected', function() {
          ds.connector.should.have.property('client');
          ds.connector.client.should.have.property('apis');
          done();
        });
      });

    it('generates client from local swagger spec - .json file',
      function(done) {
        const ds = createDataSource('test/fixtures/petStore.json');
        ds.on('connected', function() {
          ds.connector.should.have.property('client');
          ds.connector.client.should.have.property('apis');
          done();
        });
      });

    it('generates client from local swagger spec - .yaml file',
      function(done) {
        const ds = createDataSource('test/fixtures/petStore.yaml');
        ds.on('connected', function() {
          ds.connector.should.have.property('client');
          ds.connector.client.should.have.property('apis');
          done();
        });
      });

    it('generates client from swagger spec object',
      function(done) {
        const ds = createDataSource(require('./fixtures/petStore'));
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
        ds = createDataSource('test/fixtures/petStore.json');
        ds.on('connected', function() {
          done();
        });
      });

      it('creates models', function(done) {
        const PetService = ds.createModel('PetService', {});
        (typeof PetService.getPetById).should.eql('function');
        (typeof PetService.addPet).should.eql('function');
        done();
      });

      it('supports model methods', function(done) {
        const PetService = ds.createModel('PetService', {});
        PetService.getPetById({petId: 1}, function(err, res) {
          if (err) return done(err);
          res.status.should.eql(200);
          done();
        });
      });

      it('supports model methods returning a Promise', done => {
        const PetService = ds.createModel('PetService', {});
        PetService.getPetById({petId: 1}).then(
          function onSuccess(res) {
            res.should.have.property('status', 200);
            done();
          },
          /* on error */ done
        );
      });
    });

    // out of scope of initial release
    describe.skip('models with remotingEnabled', function() {
      let ds;
      before(function(done) {
        ds = createDataSource('test/fixtures/petStore.json',
          {remotingEnabled: true});
        ds.on('connected', function() {
          done();
        });
      });

      it('creates models', function(done) {
        const PetService = ds.createModel('PetService', {});
        (typeof PetService.getPetById).should.eql('function');
        PetService.getPetById.shared.should.equal(true);
        (typeof PetService.addPet).should.eql('function');
        PetService.addPet.shared.should.equal(true);
        done();
      });
    });

    it('allows models to be attached before the spec is loaded', done => {
      const ds = createDataSource('test/fixtures/petStore.json');
      const PetService = ds.createModel('PetService', {});

      ds.once('connected', () => {
        should(Object.keys(PetService)).containEql('getPetById');
        should(typeof PetService.getPetById).eql('function');
        done();
      });
    });
  });

  describe('Swagger invocations', function() {
    let ds, PetService;

    before(function(done) {
      ds = createDataSource('test/fixtures/petStore.json');
      ds.on('connected', function() {
        PetService = ds.createModel('PetService', {});
        done();
      });
    });

    it('invokes the PetService', function(done) {
      PetService.getPetById({petId: 1}, function(err, res) {
        res.status.should.eql(200);
        done();
      });
    });

    it('supports a request for xml content', function(done) {
      PetService.getPetById({petId: 1},
        {responseContentType: 'application/xml'},
        function(err, res) {
          if (err) return done(err);
          res.status.should.eql(200);
          res.headers['content-type'].should.eql('application/xml');
          done();
        });
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
      PetService.getPetById({petId: 1}, function(err, response) {
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

      PetService.getPetById({petId: 1}, function(err, response) {
        assert.deepEqual(events, ['before execute', 'after execute']);
        done();
      });
    });

    it('supports custom swagger client', done => {
      const customSwaggerClient = {
        execute: function(requestObject) {
          requestObject.on.response({id: 'custom'});
        },
      };

      const ds = createDataSource('test/fixtures/petStore.json',
        {swaggerClient: customSwaggerClient});

      ds.on('connected', () => {
        const PetService = ds.createModel('PetService', {});
        PetService.getPetById({petId: 7}, function(err, res) {
          if (err) return done(err);
          should(res).containDeep({id: 'custom'});
          done();
        });
      });
    });
  });
});

function createDataSource(spec, options) {
  const config = Object.assign({
    connector: require('../index'),
    spec: spec,
  }, options);
  return loopback.createDataSource('swagger', config);
} 

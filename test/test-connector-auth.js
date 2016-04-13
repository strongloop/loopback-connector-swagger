var assert = require('assert');
var should = require('should');
var loopback = require('loopback');

describe('Swagger connector - security', function() {
  var url = 'http://petstore.swagger.io/v2/pet/';

  describe('Basic auth', function() {
    it('supports basic auth', function(done) {
      var ds = createDataSource('test/fixtures/petStore.json', {
        type: 'basic',
        username: 'aaabbbccc',
        password: 'header',
      });
      ds.on('connected', function() {
        var PetService = ds.createModel('PetService', {});
        // with mock:true, swagger-client sends the req object it uses to make
        //http calls and stops processing request further
        var req = PetService.getPetById({ petId: 1 }, { mock: true });
        var auth = req.headers.Authorization.split(' ');
        req.headers.should.have.property('Authorization');
        auth[0].should.equal('Basic');
        done();
      });
    });
  });

  describe('apiKey auth', function() {
    it('supports apiKey - in query', function(done) {
      var ds = createDataSource('test/fixtures/petStore.json', {
        type: 'apiKey',
        name: 'api_key',
        key: 'abc12',
        in: 'query',
      });
      ds.on('connected', function() {
        var PetService = ds.createModel('PetService', {});
        var req = PetService.getPetById({ petId: 1 }, { mock: true });
        req.url.should.equal(url + '1?api_key=abc12');
        done();
      });
    });

    it('supports apiKey - in header', function(done) {
      var ds = createDataSource('test/fixtures/petStore.json', {
        type: 'apiKey',
        name: 'api_key',
        key: 'abc12',
        in: 'header',
      });
      ds.on('connected', function() {
        var PetService = ds.createModel('PetService', {});
        var req = PetService.getPetById({ petId: 1 }, { mock: true });
        req.url.should.equal(url + '1');
        req.headers.api_key.should.equal('abc12');
        done();
      });
    });
  });

  describe('oAuth2', function() {
    it('supports oauth2 - in header by default', function(done) {
      var ds = createDataSource('test/fixtures/petStore.json', {
        name: 'petstore_auth',
        type: 'oauth2',
        accessToken: 'abc123abc',
      });
      ds.on('connected', function() {
        var PetService = ds.createModel('PetService', {});
        var req = PetService.addPet({ body: { name: 'topa' }}, { mock: true });
        req.headers.should.have.property('Authorization');
        req.headers.Authorization.should.equal('Bearer abc123abc');
        done();
      });
    });

    it('supports oauth2 - in query', function(done) {
      var ds = createDataSource('test/fixtures/petStore.json', {
        name: 'x-auth', //custom extension to securityDefinition obj
        type: 'oauth2',
        accessToken: 'abc123abc',
        in: 'query',
      });
      ds.on('connected', function() {
        var PetService = ds.createModel('PetService', {});
        var req = PetService.getPetById({ petId: 1 }, { mock: true });
        req.url.should.equal(url + '1?access_token=abc123abc');
        done();
      });
    });
  });
});

function createDataSource(spec, authz) {
  return loopback.createDataSource('swagger', {
    connector: require('../index'),
    spec: spec,
    security: authz,
  });
}

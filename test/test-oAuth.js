var should = require('should');
var oAuth = require('../lib/oAuth');

describe('oAuth - standalone', function() {
  describe('accessToken auth constructor', function() {
    it('creates AccessTokenAuthorization obj', function(done) {
      var atAuth = new oAuth.AccessTokenAuthorization(
        'sampleOAuth',
        'access_token_123',
        'header'
      );
      atAuth.should.have.property('name').equal('sampleOAuth');
      atAuth.should.have.property('token').equal('access_token_123');
      atAuth.should.have.property('type').equal('header');
      done();
    });
  });

  describe('access_token in query', function() {
    var atAuth, reqObj;
    beforeEach(function(done) {
      atAuth = new oAuth.AccessTokenAuthorization('sampleOAuth',
        'sampleAccessToken',
        'query');
      reqObj = { url: 'http://sampleApi/api/getPet' };
      done();
    });

    it('adds access token as querystring',
      function(done) {
        var newUrl = reqObj.url + '?access_token=sampleAccessToken';
        atAuth.apply(reqObj);
        reqObj.url.should.equal(newUrl);
        done();
      });

    it('appends access token at the end of existing querystring',
      function(done) {
        reqObj.url = reqObj.url + '?abc=123';
        var newUrl = reqObj.url + '&access_token=sampleAccessToken';
        atAuth.apply(reqObj);
        reqObj.url.should.equal(newUrl);
        done();
      });

    it('does not modify query if access_token is present', function(done) {
      reqObj.url = reqObj.url + '?access_token=sampleAccessToken';
      var newUrl = reqObj.url;
      atAuth.apply(reqObj);
      reqObj.url.should.equal(newUrl);
      done();
    });
  });

  describe('access_token in header', function() {
    var atAuth, reqObj;
    beforeEach(function(done) {
      atAuth = new oAuth.AccessTokenAuthorization('sampleOAuth',
        'sampleAccessToken');
      reqObj = { url: 'http://sampleApi/api/getPet' };
      done();
    });

    it('adds access token in headers when no headers.Authorization present',
      function(done) {
        reqObj.headers = {};
        atAuth.apply(reqObj);
        reqObj.headers.should.have.property('Authorization')
          .equal('Bearer sampleAccessToken');
        done();
      });

    it('adds access token in headers when authorization header is empty',
      function(done) {
        reqObj.headers = { Authorization: '' };
        atAuth.apply(reqObj);
        reqObj.headers.should.have.property('Authorization')
          .equal('Bearer sampleAccessToken');
        done();
      });
    it('treats "authorization" header case-insensitively',
      function(done) {
        reqObj.headers = { autHoriZation: '' };
        atAuth.apply(reqObj);
        reqObj.headers.should.have.property('autHoriZation')
          .equal('Bearer sampleAccessToken');
        done();
      });
    it('does not add to authorization header if one already present',
      function(done) {
        reqObj.headers = { Authorization: 'alreadyIamhere' };
        atAuth.apply(reqObj);
        reqObj.headers.should.have.property('Authorization')
          .equal('alreadyIamhere');
        done();
      });
  });
});

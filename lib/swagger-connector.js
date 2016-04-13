'use strict';

var fs = require('fs');
var path = require('path');
var url = require('url');
var debug = require('debug')('loopback:connector:swagger');
var oAuth = require('./oAuth');
var SpecResolver = require('./spec-resolver');
var VERSION = require('../package.json').version;
var SwaggerClient = require('swagger-client');

/**
 * Export the initialize method to loopback-datasource-juggler
 * @param {DataSource} dataSource The dataSource object
 * @param callback
 */

exports.initialize = function initializeDataSource(dataSource, callback) {
  var settings = dataSource.settings || {};

  var connector = new SwaggerConnector(settings);

  dataSource.connector = connector;
  dataSource.connector.dataSource = dataSource;
  connector.connect(callback);
};

/**
 * The SwaggerConnector constructor
 * @param {Object} settings The connector settings
 * @constructor
 */
function SwaggerConnector(settings) {
  settings = settings || {};

  this.settings = settings;
  this.spec = settings.spec;
  this.connectorHooks = new ConnectorHooks();

  if (debug.enabled) {
    debug('Settings: %j', settings);
  }

  this._models = {};
  this.DataAccessObject = function() {
    // Dummy function
  };
}

/**
 * Parse swagger specification, setup client and export client
 * @param {Function} callback function
 * @prototype
 */

SwaggerConnector.prototype.connect = function(cb) {
  var self = this;

  if (self.client) {
    process.nextTick(function() {
      cb && cb(null, self.client);
    });
    return;
  }

  if (!self.spec) {
    process.nextTick(function() {
      cb(new Error('No swagger specification provided'), null);
    });
    return;
  }

  SpecResolver.resolveSpec(self, function(err, connector) {
    if (err) return cb(err, null);

    if (self.settings.validate) {
      SpecResolver.validateSpec(self.url || self.spec, function(err, api) {
        if (err) return cb(err, null);

        if (debug.enabled) {
          debug('Valid swagger specification: %j', self.url || self.spec);
        }
      });
    }

    if (debug.enabled) {
      debug('Reading swagger specification from: %j', self.url || self.spec);
    }

    var client = new SwaggerClient({
      url: self.url,
      spec: self.spec,
      requestInterceptor: self.connectorHooks.beforeExecute,
      success: function() {
        useClient(client);
      },
      failure: function(err) {
        var e = new Error(err);
        cb(e, null);
      },
    });

    function useClient(client) {
      if (debug.enabled) {
        debug('swagger loaded: %s', self.spec);
      }

      client.connector = self;
      self.client = client;
      self.setupAuth();
      self.setupDataAccessObject();
      self.setupConnectorHooks();
      cb(null, client);
    }
  });
};


// Setup authentication to make http calls

SwaggerConnector.prototype.setupAuth = function() {
  var client = this.client;

  if (this.settings.security) {
    var secConfig = this.settings.security || this.settings;
    if (debug.enabled) {
      debug('configuring security: %j', secConfig);
    }
    switch (secConfig.type) {

      case 'basic':
        client.clientAuthorizations.add(
          'basic',
          new SwaggerClient.PasswordAuthorization(secConfig.username,
            secConfig.password));
        break;

      case 'apiKey':
        var authObj = new SwaggerClient.ApiKeyAuthorization(
          secConfig.name, secConfig.key, secConfig.in);
        client.clientAuthorizations.add(secConfig.name,
         authObj);
        break;

      case 'oauth2':
        var oauth = new oAuth.AccessTokenAuthorization(
          secConfig.name,
          secConfig.accessToken,
          secConfig.in);
        client.clientAuthorizations.add(secConfig.name, oauth);
        break;
    }
  }
  return client;
};

// Parse swagger specification, setup client and export client

SwaggerConnector.prototype.setupDataAccessObject = function() {
  if (this.swaggerParsed && this.DataAccessObject) {
    return this.DataAccessObject;
  }

  this.swaggerParsed = true;

  /* eslint-disable one-var */

  for (var a in this.client.apis) {
    var api = this.client[a];

    for (var o in api.operations) {
      var method = api[o];
      var methodName = this._methodName(a, o, this.DataAccessObject);

      if (debug.enabled) {
        debug('Adding method: %s %s ', a, o);
      }

      var wrapper = createCallbackWrapper(method);
      var swaggerMethod = wrapper.bind(this.client);
      // TODO: gunjpan: support remotingEnabled
      //var swaggerOp = api.apis[o];
      // if (this.settings.remotingEnabled) {
      //   remoting.setRemoting.call(swaggerMethod, swaggerOp);
      // }
      this.DataAccessObject[methodName] = swaggerMethod;
    }
  }

  this.dataSource.DataAccessObject = this.DataAccessObject;

  for (var model in this._models) {
    if (debug.enabled) {
      debug('Mixing methods into : %s', model);
    }
    this.dataSource.mixin(this._models[model].model);
  }
  return this.DataAccessObject;

  /* eslint-enable one-var */
};


/**
 * Find or derive the method name from apiName/operationName
 * @param {String} apiName The api name
 * @param {String} operationName The api operation name
 * @param {Object} dao The data access object
 * @returns {String} The method name
 * @private
 */

SwaggerConnector.prototype._methodName =
  function(apiName, operationName, dao) {
    if (dao && (operationName in dao)) {
      //if operation name exists, create full name
      return apiName + '_' + operationName;
    } else {
      return operationName;
    }
  };

/**
 * Wrapper for converting callback style to arguments accepted by swagger-client
 * @param {Function}  A method to use in wrapper
 * @return {Function} wrapper function
 */

function createCallbackWrapper(method) {
  function wrapper() {
    var args = [];
    var fn = method;

    if (arguments.length) {
      args = arguments.length === 1 ?
        [arguments[0]] : Array.apply(null, arguments);

      var cb;
      var success = function(res) {
        cb(null, res);
      };
      var failure = function(err) {
        cb(err, null);
      };
      /* assuming that the last argument is a nodejs style callback function.
       * swagger-client accepts two seperate functions one for response and
       * another for error. Following is to comply with the swagger-client
       * while letting users provide single callback function
       */
      if (typeof args[args.length - 1] === 'function') {
        cb = args.pop();
        args.push(success);
        args.push(failure);
      }
    }
    return fn.apply(this, args);
  }
  return wrapper;
}


// Setup connector hooks around execute operation
SwaggerConnector.prototype.setupConnectorHooks = function() {
  var self = this;
  self.connectorHooks.beforeExecute.apply = function(obj) {
    obj.headers['User-Agent'] = 'loopback-connector-swagger/' + VERSION;
    obj.beforeSend = function(cb) {
      var ctx = { req: obj };
      self.notifyObserversOf('before execute', ctx, function(err) {
        if (err) return cb(err);

        cb(ctx.req);
      });
    };
    var cbSuccess = obj.on.response;
    var cbError = obj.on.error;

    obj.on.response = function(data) {
      var ctx = { res: data };
      self.notifyObserversOf('after execute', ctx, function(err) {
        if (err) return cbError(err);

        cbSuccess(ctx.res);
      });
    };

    obj.on.error = function(data) {
      var ctx = { res: null, err: data };
      self.notifyObserversOf('after execute', ctx, function(err) {
        return cbError(ctx.err);
      });
    };

    return obj;
  };
};

/**
 * The ConnectorHooks constructor
 * @constructor
 */

function ConnectorHooks() {
  if (!(this instanceof ConnectorHooks)) {
    return new ConnectorHooks();
  }

  this.beforeExecute = {
    apply: function() {
      //dummy function
    },
  };
  this.afterExecute = {
    apply: function() {
      //dummy function
    },
  };
}

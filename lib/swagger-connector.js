// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('assert');
var fs = require('fs');
var path = require('path');
var url = require('url');
var debug = require('debug')('loopback:connector:swagger');
var oAuth = require('./oAuth');
var SpecResolver = require('./spec-resolver');
var VERSION = require('../package.json').version;
var SwaggerClient = require('swagger-client');
const qs = require('querystring');

const Promise = require('bluebird');

/**
 * Export the initialize method to loopback-datasource-juggler
 * @param {DataSource} dataSource The dataSource object
 * @param callback
 */

exports.initialize = function initializeDataSource(dataSource, callback) {
  var settings = dataSource.settings || {};

  if (settings.cache) {
    assert(settings.cache.model, '"cache.model" setting is required');
    assert(!!settings.cache.ttl, '"cache.ttl" setting is required');
    assert(settings.cache.ttl > 0, '"cache.ttl" must be a positive number');
  }

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
  this.cache = settings.cache;
  this.connectorHooks = new ConnectorHooks();
  this.swaggerClient = settings.swaggerClient;

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
      if (cb) cb(null, self.client);
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
      client: self.swaggerClient || false,
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
        debug('Adding method api=%s operation=%s as %s', a, o, methodName);
      }

      var wrapper = createCallbackWrapper(method);
      var swaggerMethod = wrapper.bind(this.client);
      // TODO: gunjpan: support remotingEnabled
      // var swaggerOp = api.apis[o];
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
 * Hook for defining a model by the data source
 * @param {object} modelDef The model description
 */
SwaggerConnector.prototype.define = function(modelDef) {
  const modelName = modelDef.model.modelName;
  this._models[modelName] = modelDef;
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
      // if operation name exists, create full name
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
    const args = new Array(arguments.length);
    // do not call Array.prototype.slice on arguments
    // to avoid deoptimization of this method by V8
    let ix;
    for (ix = 0; ix < arguments.length; ix++) {
      args[ix] = arguments[ix];
    }

    if (!args.length) {
      // the caller did not provide any operation parameters to use
      // add an empty object as the params to satisfy swagger-client API
      args.push({});
    }

    const lastArg = args.length ? args[args.length - 1] : undefined;
    const isPromiseMode = !args.length ||
      typeof lastArg !== 'function';
    const isMockMode = typeof lastArg === 'object' && lastArg.mock;

    if (isPromiseMode && !isMockMode) {
      return new Promise((resolve, reject) => {
        args.push(resolve);
        args.push(reject);
        // "this" is preserved via the arrow function
        method.apply(this, args);
      });
    }

    if (arguments.length) {
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
    return method.apply(this, args);
  }
  return wrapper;
}

// Setup connector hooks around execute operation
SwaggerConnector.prototype.setupConnectorHooks = function() {
  var self = this;
  self.connectorHooks.beforeExecute.apply = function(obj) {
    obj.headers['User-Agent'] = 'loopback-connector-swagger/' + VERSION;

    var cbSuccess = obj.on.response;
    var cbError = obj.on.error;

    obj.beforeSend = function(cb) {
      var ctx = {req: obj};
      self.notifyObserversOf('before execute', ctx, function(err) {
        if (err) return cbError(err);
        obj = ctx.req;
        self._checkCache(obj, function(err, cachedResponse) {
          if (err) return cbError(err);
          if (cachedResponse)
            return cbSuccess(cachedResponse);
          cb(obj);
        });
      });
    };
    obj.on.response = function(data) {
      var ctx = {res: data};
      self.notifyObserversOf('after execute', ctx, function(err) {
        if (err) return cbError(err);
        data = ctx.res;
        self._updateCache(obj, data, function(err) {
          if (err) cbError(err);
          else cbSuccess(data);
        });
      });
    };

    obj.on.error = function(data) {
      var ctx = {res: null, err: data};
      self.notifyObserversOf('after execute', ctx, function(err) {
        return cbError(ctx.err);
      });
    };

    return obj;
  };
};

SwaggerConnector.prototype._checkCache = function(req, cb) {
  const Cache = this._getCacheModel();
  if (!Cache) return cb();

  const key = this._getCacheKey(req);
  if (!key) return cb();

  Cache.get(key, (err, value) => {
    if (err)
      return cb(err);
    if (!value)
      return cb();

    debug('Returning cached response for %s', key);
    return req.on.response(value);
  });
};

SwaggerConnector.prototype._updateCache = function(req, res, cb) {
  const Cache = this._getCacheModel();
  if (!Cache) return cb();

  const key = this._getCacheKey(req);
  if (!key) return cb();

  Cache.set(key, res, {ttl: this.settings.cache.ttl}, cb);
};

SwaggerConnector.prototype._getCacheKey = function(req) {
  if (req.method.toLowerCase() !== 'get')
    return null;

  const base = req.url.replace(/^[^:]+:\/\/[^\/]+/, '');
  const headers = qs.stringify(req.headers);
  return base + ';' + headers;
};

SwaggerConnector.prototype._getCacheModel = function() {
  if (!this.cache) return null;
  let Model = this.cache.model;
  if (typeof Model === 'function' || Model === null)
    return Model;

  const modelName = Model;
  Model = this.dataSource.modelBuilder.getModel(modelName);
  if (!Model) {
    // NOTE(bajtos) Unfortunately LoopBack does not propagate the datasource
    // name used in the app registry down to the DataSource object
    // As a workaround, we can use Swagger service name and URL instead
    const title = this.client.info && this.client.info.title;
    const url = this.client.scheme + '://' + this.client.host + '/' +
      this.client.basePath;
    const name = title ? `"${title}" (${url})` : url;

    console.warn(
      'Model %j not found, caching is disabled for Swagger datasource %s',
      modelName, name);
    Model = null;
  }

  this.cache.model = Model;
  return Model;
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
      // dummy function
    },
  };
  this.afterExecute = {
    apply: function() {
      // dummy function
    },
  };
}

// Copyright IBM Corp. 2016,2018. All Rights Reserved.
// Node module: loopback-connector-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('assert');
const debug = require('debug')('loopback:connector:swagger');
const SpecResolver = require('./spec-resolver');
const VERSION = require('../package.json').version;
const SwaggerClient = require('swagger-client');
const qs = require('querystring');
const util = require('util');

/**
 * Export the initialize method to loopback-datasource-juggler
 * @param {DataSource} dataSource The dataSource object
 * @param callback
 */
exports.initialize = function initializeDataSource(dataSource, callback) {
  const settings = dataSource.settings || {};

  if (settings.cache) {
    assert(settings.cache.model, '"cache.model" setting is required');
    assert(!!settings.cache.ttl, '"cache.ttl" setting is required');
    assert(settings.cache.ttl > 0, '"cache.ttl" must be a positive number');
  }

  const connector = new SwaggerConnector(settings);

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
  this.url = settings.url;
  this.spec = settings.spec;
  this.cache = settings.cache;
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
  const self = this;

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

  const validate = !!self.settings.validate;
  SpecResolver.resolve(
    self.spec,
    {validate: {schema: validate, spec: validate}},
    function(err, api) {
      if (err) return cb(err, null);

      if (debug.enabled) {
        debug('Reading swagger specification from: %j', self.spec);
      }

      self.setupConnectorHooks();
      const req = {
        url: self.url,
        spec: api,
        authorizations: self.settings.authorizations || {},
        requestInterceptor: self.connectorHooks.beforeExecute,
        responseInterceptor: self.connectorHooks.afterExecute,
      };

      SwaggerClient(req).then(
        client => {
          useClient(client);
        },
        err => {
          const e = new Error(err);
          cb(e, null);
        },
      );

      function useClient(client) {
        if (debug.enabled) {
          debug('swagger loaded: %s', self.spec);
        }

        client.connector = self;
        self.client = client;
        self.setupDataAccessObject();
        cb(null, client);
      }
    },
  );
};

// Parse swagger specification, setup client and export client

SwaggerConnector.prototype.setupDataAccessObject = function() {
  if (this.swaggerParsed && this.DataAccessObject) {
    return this.DataAccessObject;
  }

  this.swaggerParsed = true;

  /* eslint-disable one-const */
  for (const tag in this.client.apis) {
    const api = this.client.apis[tag];

    for (const opName in api) {
      const method = api[opName];
      const methodName = this._methodName(tag, opName, this.DataAccessObject);

      if (debug.enabled) {
        debug(
          'Adding method api=%s operation=%s as %s',
          tag,
          opName,
          methodName,
        );
      }

      const wrapper = createWrapper(method);
      const swaggerMethod = wrapper.bind(api);
      // TODO: gunjpan: support remotingEnabled
      // const swaggerOp = api.apis[o];
      // if (this.settings.remotingEnabled) {
      //   remoting.setRemoting.call(swaggerMethod, swaggerOp);
      // }
      this.DataAccessObject[methodName] = swaggerMethod;
    }
  }

  this.DataAccessObject.execute = (operationId, parameters, options) => {
    const request = {
      operationId,
      parameters,
    };
    Object.assign(request, options);
    return this.client.execute(request);
  };

  this.dataSource.DataAccessObject = this.DataAccessObject;

  for (const model in this._models) {
    if (debug.enabled) {
      debug('Mixing methods into : %s', model);
    }
    this.dataSource.mixin(this._models[model].model);
  }
  return this.DataAccessObject;

  /* eslint-enable one-const */
};

function createWrapper(method) {
  const methodWithCallback = util.callbackify(method);
  return function(...args) {
    if (args.length >= 1 && typeof args[args.length - 1] === 'function') {
      // Callback style
      return methodWithCallback(...args);
    } else {
      return method(...args);
    }
  };
}

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

SwaggerConnector.prototype._methodName = function(apiName, operationName, dao) {
  if (dao && operationName in dao) {
    // if operation name exists, create full name
    return apiName + '_' + operationName;
  } else {
    return operationName;
  }
};

// Setup connector hooks around execute operation
SwaggerConnector.prototype.setupConnectorHooks = function() {
  const self = this;
  self.connectorHooks.beforeExecute = function requestInterceptor(req) {
    req.headers['User-Agent'] = 'loopback-connector-swagger/' + VERSION;

    function responseInterceptor(res) {
      const afterResponse = function(data, cb) {
        const ctx = {res: data};
        self.notifyObserversOf('after execute', ctx, function(err) {
          if (err) return cb(err);
          data = ctx.res;
          self._updateCache(req, res, function(err) {
            if (err) cb(err);
            else cb(null, res);
          });
        });
      };
      return util.promisify(afterResponse)(res.body);
    }

    function beforeSend(cb) {
      const ctx = {req: req};
      self.notifyObserversOf('before execute', ctx, function(err) {
        if (err) return cb(err);
        req = ctx.req;
        // Set up a response interceptor for the given request
        req.responseInterceptor = responseInterceptor;
        self._checkCache(req, function(err, cachedResponse) {
          if (err) return cb(err);
          if (cachedResponse) {
            // Set up a custom `userFetch` to return response directly
            // from the cache
            req.userFetch = () => {
              const headers = cachedResponse.headers;
              cachedResponse.headers = new Map();

              for (const h in headers) {
                cachedResponse.headers.set(h, headers[h]);
              }
              const value = cachedResponse.text;
              cachedResponse.text = () => Promise.resolve(value);
              cachedResponse.buffer = () => Promise.resolve(value);
              return Promise.resolve(cachedResponse);
            };
          }
          cb(null, req);
        });
      });
    }

    return util.promisify(beforeSend)();
  };
};

SwaggerConnector.prototype._checkCache = function(req, cb) {
  const Cache = this._getCacheModel();
  if (!Cache) return cb();

  const key = this._getCacheKey(req);
  if (!key) return cb();

  Cache.get(key, (err, value) => {
    if (err) return cb(err);
    if (!value) return cb();

    debug('Returning cached response for %s', key, value);
    return cb(null, value);
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
  if (req.method.toLowerCase() !== 'get') return null;

  const base = req.url.replace(/^[^:]+:\/\/[^\/]+/, '');
  const headers = qs.stringify(req.headers);
  return base + ';' + headers;
};

SwaggerConnector.prototype._getCacheModel = function() {
  if (!this.cache) return null;
  let Model = this.cache.model;
  if (typeof Model === 'function' || Model === null) return Model;

  const modelName = Model;
  Model = this.dataSource.modelBuilder.getModel(modelName);
  if (!Model) {
    // NOTE(bajtos) Unfortunately LoopBack does not propagate the datasource
    // name used in the app registry down to the DataSource object
    // As a workaround, we can use Swagger service name and URL instead
    const title = this.client.info && this.client.info.title;
    const url =
      this.client.scheme +
      '://' +
      this.client.host +
      '/' +
      this.client.basePath;
    const name = title ? `"${title}" (${url})` : url;

    console.warn(
      'Model %j not found, caching is disabled for Swagger datasource %s',
      modelName,
      name,
    );
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

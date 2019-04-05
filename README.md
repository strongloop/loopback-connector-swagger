**This repository is now deprecated. Please use https://github.com/strongloop/loopback-connector-openapi instead.**

# loopback-connector-swagger
The Swagger connector enables LoopBack applications to interact with other REST APIs described by the [OpenAPI (Swagger) Specification v.2.0](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md).

## Installation

In your application root directory, enter:
```
$ npm install loopback-connector-swagger --save
```

This will install the module from npm and add it as a dependency to the application's `package.json` file.

## Configuration

To interact with a Swagger API, configure a data source backed by the Swagger connector:

With code:

```javascript
  var ds = loopback.createDataSource('swagger', {
    connector: 'loopback-connector-swagger',
    spec: 'http://petstore.swagger.io/v2/swagger.json',
  });
```

With JSON in `datasources.json` (for example, with basic authentication):

```
"SwaggerDS": {
    "name": "SwaggerDS",
    "connector": "swagger",
    "spec": "http://petstore.swagger.io/v2/swagger.json",
    "security": {
      "type" : "basic",
      "username": "the user name",
      "password": "thepassword"
}
```

### Caching

As an experimental feature, loopback-connector-swagger is able to cache the result of `GET` requests.

**Important: we support only one cache invalidation mechanism - expiration based on a static TTL value.**

To enable caching, you need to specify:

 - `cache.model` (required) - name of the model providing access to the cache.
   The model should be extending loopback's built-in `KeyValueModel`
   and be attached to one of key-value datasources (e.g. Redis or
   eXtremeScale).

 - `cache.ttl` (required) - time to live for cache entries, the value
   is in milliseconds. Note that certain cache implementations (notably
   eXtremeScale) do not support sub-second precision for TTL.

#### Example configuration

`server/datasources.json`

```json
{
  "SwaggerDS": {
    "connector": "swagger",
    "cache": {
      "model": "SwaggerCache",
      "ttl": 100
    }
  },
  "cache": {
    "connector": "kv-redis",
  }
}
```

`common/models/swagger-cache.json`

```
{
  "name": "SwaggerCache",
  "base": "KeyValueModel",
  // etc.
}
```

`server/model-config.json`
```
{
  "SwaggerCache": {
    "dataSource": "cache",
    "public": false
  }
}
```

## Data source properties

Specify the options for the data source with the following properties.

| Property | Description | Default   |
|----------|-------------|-----------|
| connector | Must be `'loopback-connector-swagger'` to specify Swagger connector| None |
|spec      | HTTP URL or path to the Swagger specification file (with file name extension `.yaml/.yml` or `.json`).  File path must be relative to current working directory (`process.cwd()`).| None |
|validate | When `true`, validates provided `spec` against Swagger specification 2.0 before initializing a data source. | `false`|
| security | Security configuration for making authenticated requests to the API.  The `security.type` property specifies authentication type, one of: Basic authentication (`basic`), API Key (`apiKey`), or OAuth2 (`oauth2`). | `basic` |

### Authentication

Basic authentication:

```javascript
security: {
  type: 'basic', // default type, not to be changed
  username: 'the user name',
  password: 'password'
}
```

API Key:

```javascript
security: {
  type: 'apiKey', // default type, not to be changed
  name: 'api_key',
  key: 'yourAPIKey',
  in: 'query' // or 'header'
}
```

OAuth2:

```javascript
security:{
  type: 'oauth2', // default type, not to be changed
  name: 'oauth_scheme',
  accessToken: 'sampleAccessToken', // access token
  in: 'query' // defaults to `header` if not set
}
```

**Note**: The value of the `name` property must correspond to a security scheme declared in the [Security Definitions object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md#security-definitions-object) within the `spec` document.

### Creating a model from the Swagger data source

The Swagger connector loads the API specification document asynchronously. As a result, the data source won't be ready to create models until it is connected.  For best results, use an event handler for the `connected` event of data source:

```javascript
ds.once('connected', function(){
  var PetService = ds.createModel('PetService', {});
  ...
});
```
Once the model is created, all available Swagger API operations can be accessed as model methods, for example:

```javascript
...
PetService.getPetById({petId: 1}, function (err, res){
  ...
});
```

#### How model methods are named for given Swagger API Operations:
This connector uses [swagger-client](https://github.com/swagger-api/swagger-js) which dominates the naming of generated methods for calling client API operations.

Following is how it works:

- When `operationId` is present, for example:

```javascript
paths: {
  /weather/forecast:
  get:
    ...
    operationId: weather.forecast
    ...
```
  Here, as `operationId` is present in Swagger specification, the generated method is named equivalent to `operationId`.

  Note:
      if `operationId` is of format equivalent to calling a nested function such as: `weather.forecast`, the resulting method name will replace `.` with `_` i.e. `weather.forecast` will result into `weather_forecast`.This means you can call `MyModel.weather_forecast()` to access this endpoint programmatically.

- When `operationId` is not provided in Swagger specification, the method name is formatted as following:
`<operationType (i.e. get, post, etc)> + _ + <path parts separated by underscores>`

For example:
```
/weather/forecast:
  get:
    ...
```
for above operation, the resulting method name will be: `get_weather_forecast`.

This means you can call `MyModel.get_weather_forecast()` to access this endpoint programmatically.

### Extend a model to wrap/mediate API Operations
Once you define the model, you can wrap or mediate it to define new methods. The following example simplifies the `getPetById` operation to a method that takes `petID` and returns a Pet instance.

```javascript
  PetService.searchPet = function(petID, cb){
    PetService.getPetById({petId: petID}, function(err, res){
      if(err) cb(err, null);
      var result = res.data;
      cb(null, result);
    });
  };
```

This custom method on the `PetService` model can be exposed as REST API end-point. It uses `loopback.remoteMethod` to define the mappings:

```javascript
loopback.remoteMethod(
  PetService.searchPet, {
    accepts: [
      { arg: 'petID', type: 'string', required: true,
        http: { source: 'query' }
      }
    ],
    returns: {arg: 'result', type: 'object', root: true },
    http: {verb: 'get', path: '/searchPet'}
  }
);
```

### Example

Coming soon...

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

### Extend a model to wrap/mediate API Operations
Once you define the model, you can wrap or mediate it to define new methods. The following example simplifies the `getPetById` operation to a method that takes `petID` and returns a Pet instance.

```javascript
PetService.searchPet = function(petID, cb){
  PetService.getPetById({petId: petID, function(err, res){
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

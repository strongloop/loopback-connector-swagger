import {
  Request,
  RestBindings,
  get,
  ResponseObject,
  param,
  requestBody,
  post,
} from '@loopback/rest';
import {inject} from '@loopback/context';

/**
 * OpenAPI response for ping()
 */
const PING_RESPONSE: ResponseObject = {
  description: 'Ping Response',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          greeting: {type: 'string'},
          date: {type: 'string'},
          url: {type: 'string'},
          headers: {
            type: 'object',
            properties: {
              'Content-Type': {type: 'string'},
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
};

/**
 * A simple controller to bounce back http requests
 */
export class PingController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  // Map to `GET /ping`
  @get('/ping', {
    responses: {
      '200': PING_RESPONSE,
    },
  })
  ping(): object {
    // Reply with a greeting, the current time, the url, and request headers
    return {
      greeting: 'Hello from LoopBack',
      date: new Date(),
      url: this.req.url,
      headers: Object.assign({}, this.req.headers),
    };
  }

  @post('/greet', {
    responses: {
      '200': {
        description: 'Greet Response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                hello: {type: 'string'},
              },
              additionalProperties: true,
            },
          },
        },
      },
    },
  })
  greet(
    @requestBody({
      description: 'Greet request',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              requestId: {type: 'string'},
            },
          },
        },
      },
    })
    body: object,
    @param.query.string('name') name: string = 'world',
  ) {
    const greeting = Object.assign(
      {
        hello: `${name}`,
      },
      body,
    );
    return greeting;
  }
}

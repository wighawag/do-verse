import { ACCESS_TOKENS } from './utils/authentication';
import {
  Avatars,
  SocketClientMessageTypes,
  SocketRequestResponse,
  SocketRequestResponseTypes,
  SocketServerMessageTypes,
} from './types';
import { days, timestamp } from './utils/time';
import { fetchGlobalDO, pathFromURL } from './utils/request';
import { isSignatureValid } from './utils/ethereum';
import { formatError } from './utils/errors';

export type RoomState = { avatars: Avatars };

export type SocketConnection = {
  webSocket: WebSocket;
  authenticatedAddress?: string;
  tokenIDChosen?: string;
};

export class Room {
  protected socketConnections: SocketConnection[];
  private initializePromise: Promise<void> | undefined;

  static signatureTemplate: string | undefined;

  constructor(protected state: DurableObjectState, protected env: Env) {
    this.socketConnections = [];
  }

  async initialize() {
    // nothing here. yet
  }

  clearSocketConnection(session: SocketConnection, webSocket: WebSocket) {
    const index = this.socketConnections.indexOf(session);
    if (index >= 0) {
      this.socketConnections.splice(index, 1);
    }

    try {
      webSocket.close(1011, 'WebSocket closed.');
    } catch (e) {
      // ignore errors here
    }
  }

  broadcast(message: SocketServerMessageTypes, exceptSocket: WebSocket) {
    let counter = 0;
    this.socketConnections.forEach((connection) => {
      if (connection.webSocket !== exceptSocket) {
        console.log(`sending to ${++counter}`);
        connection.webSocket.send(JSON.stringify(message));
      } else {
        console.log(`not sending to ${++counter}`);
      }
    });
  }

  send(socket: WebSocket, message: SocketServerMessageTypes) {
    socket.send(JSON.stringify(message));
  }

  async updateRoomState(func: (state: RoomState) => RoomState): Promise<void> {
    let state = await this.state.storage.get<RoomState>('_state_');
    if (!state) {
      state = { avatars: {} };
    }
    state = func(state);
    this.state.storage.put<RoomState>('_state_', state);
  }

  async handleSocketConnection(webSocket: WebSocket) {
    webSocket.accept();

    const connection: SocketConnection = { webSocket };
    this.socketConnections.push(connection);

    let state = await this.state.storage.get<RoomState>('_state_');
    if (!state) {
      state = { avatars: {} };
    }
    // if (!state[request.token]) {
    //   state[request.token] = {position: {x: 0, y: 0, z :0}};
    // }

    console.log(`sending initial state...`);
    this.send(connection.webSocket, {
      type: 'data',
      avatars: state.avatars,
    });
    console.log(`...`);

    const handleMessage = async (message: SocketClientMessageTypes) => {
      switch (message.type) {
        case 'move':
          // console.log(message);
          const tokenID = message.tokenID;
          // TODO check valid pos
          if (connection.tokenIDChosen !== tokenID) {
            // TODO error ?
            console.log(
              `invalid token: ${
                connection.tokenIDChosen
              } (${typeof connection.tokenIDChosen}) vs ${tokenID} (${typeof tokenID})`,
            );
            return;
          }
          await this.updateRoomState((state) => {
            const currentState = state.avatars[tokenID] || {
              position: { x: 0, y: 0, z: 0 },
              rotation: { rx: 0, ry: 0, rz: 0 },
              animation: 'Idle',
              // TODO animationStartTime?
            };

            currentState.position = message.position;
            currentState.rotation = message.rotation;
            currentState.animation = message.animation;
            state.avatars[tokenID] = currentState;
            return state;
          });
          await this.broadcast(
            {
              type: 'move',
              tokenID: message.tokenID,
              position: message.position,
              rotation: message.rotation,
              animation: message.animation,
            },
            connection.webSocket,
          );
          break;
        default: {
          throw new Error(`Unknown Message Type: ${message.type}`);
        }
      }
    };

    const handleRequest = async <T extends SocketRequestResponseTypes>(
      request: T['request'],
      id: number,
    ) => {
      let response: T['response'];

      switch (request.type) {
        case 'select':
          // TODO check ownership

          try {
            const resp = await fetchGlobalDO(
              this.env.ETHEREUM_EVENTS,
              new Request(
                `http://localhost/events/get?typeName=Token&id=${request.token}`,
              ),
            );
            const json: { result?: { owner: string }; error?: any } =
              await resp.json();
            if (
              json.result &&
              json.result.owner ===
                connection.authenticatedAddress?.toLowerCase()
            ) {
              connection.tokenIDChosen = request.token;
              response = {
                type: 'select',
                token: request.token,
              };
            } else {
              response = {
                type: 'error',
                message: `Not Authorized, do not own token "${request.token}", It is ${json.result?.owner} that owns it.`,
                code: 5000,
              };
            }
          } catch (err) {
            response = {
              type: 'error',
              message: 'failed to contact token stores',
              code: 5000,
            };
          }

          break;
        case 'deauthentication':
          connection.authenticatedAddress = undefined;
          response = {
            type: 'deauthentication',
          };
          break;
        case 'authentication':
          switch (request.method) {
            case 'signature':
              const signature = request.signature;
              const owner = request.owner;
              let message: string;
              if (Room.signatureTemplate) {
                message = Room.signatureTemplate;
              } else {
                message = `Please sign this message so we can verify ownership (Dated: {dateUTC})`;
              }
              message = message.replace(`{owner}`, owner);
              if (
                message.indexOf('{timestamp}') ||
                message.indexOf('{dateUTC}')
              ) {
                const now = Math.floor(Date.now() / 1000);
                if (now - request.timestamp > 60) {
                  response = {
                    type: 'error',
                    message: 'Unauthorized (expired)',
                    code: 401,
                  };
                  break;
                }
                message = message.replace(
                  `{timestamp}`,
                  '' + request.timestamp,
                );
                message = message.replace(
                  `{dateUTC}`,
                  new Date(request.timestamp * 1000).toUTCString(),
                );
              }

              // console.log(`message: ${message}`);

              let valid: boolean;
              try {
                valid = isSignatureValid({ owner, message, signature });
              } catch (err) {
                response = {
                  type: 'error',
                  message: 'Internal Server Error (Failed to Verify Signature)',
                  code: 500,
                  error: formatError(err),
                  stack: (err as any).stack,
                };
                break;
              }
              if (valid) {
                connection.authenticatedAddress = request.owner;

                const accessToken = crypto.randomUUID();
                const expiration = timestamp() + days(7);

                response = {
                  type: 'authentication',
                  authenticatedAddress: connection.authenticatedAddress,
                  accessToken: {
                    token: accessToken,
                    expiration,
                  },
                };

                console.log(
                  `saving token ${accessToken} 's owner as ${connection.authenticatedAddress}`,
                );
                try {
                  await this.env.ACCESS_TOKENS.put(
                    ACCESS_TOKENS.ID(accessToken),
                    '' + connection.authenticatedAddress,
                    { expiration },
                  );
                } catch (err) {
                  response = {
                    type: 'error',
                    message:
                      'Internal Server Error (Failed to Store Authentication)',
                    code: 500,
                    error: formatError(err),
                    stack: (err as any).stack,
                  };
                  break;
                }
              } else {
                response = {
                  type: 'error',
                  message: 'Unauthorized (wrong signer)',
                  code: 401,
                };
              }
              break;
            case 'accessToken':
              const ownerForToken = await this.env.ACCESS_TOKENS.get(
                ACCESS_TOKENS.ID(request.accessToken),
              );
              console.log(
                `token ${request.accessToken} 's owner is ${ownerForToken}`,
              );
              if (ownerForToken) {
                const accessToken = crypto.randomUUID();
                const expiration = timestamp() + days(7);

                connection.authenticatedAddress = ownerForToken;
                response = {
                  type: 'authentication',
                  authenticatedAddress: connection.authenticatedAddress,
                  accessToken: {
                    token: accessToken,
                    expiration,
                  },
                };
                await this.env.ACCESS_TOKENS.put(
                  ACCESS_TOKENS.ID(accessToken),
                  connection.authenticatedAddress,
                  { expiration },
                );
              } else {
                // TODO expiration handling
                response = {
                  type: 'error',
                  message: 'Unauthorized (invalid token)',
                  code: 401,
                };
              }
              break;
            default: {
              response = {
                type: 'error',
                message: `Invalid authentication method : ${
                  (request as any).method
                }`,
                code: 400,
              };
            }
          }

          break;
        default: {
          response = {
            type: 'error',
            message: `Unknown Request Type: ${(request as any).type}.`,
            code: 400,
          };
        }
      }

      webSocket.send(JSON.stringify({ ...response, id }));
    };

    webSocket.addEventListener('message', async ({ data }) => {
      try {
        let dataAsString: string;
        if (typeof data === 'string') {
          dataAsString = data;
        } else {
          dataAsString = data.toString();
        }
        const message:
          | SocketClientMessageTypes
          | (SocketRequestResponse<any, any>['request'] & { id?: number }) =
          JSON.parse(dataAsString);

        if (!message.id) {
          return handleMessage(message);
        } else {
          return handleRequest(message, message.id);
        }
      } catch (err: any) {
        webSocket.send(JSON.stringify({ error: err.stack }));
      }
    });

    webSocket.addEventListener('close', () => {
      console.error(`socket was closed`);
      this.clearSocketConnection(connection, webSocket);
    });

    webSocket.addEventListener('error', (e) => {
      console.error(`error`, e);
      this.clearSocketConnection(connection, webSocket);
    });
  }

  async fetch(request: Request) {
    if (!this.initializePromise) {
      this.initializePromise = this.initialize().catch((err) => {
        this.initializePromise = undefined;
        throw err;
      });
    }
    await this.initializePromise;

    const { patharray } = pathFromURL(request.url);

    switch (patharray[0]) {
      // called by worker when a user want to establish a websocket connection
      case 'ws': {
        // const token = patharray[1];

        console.log(`creating websocket connection...`);
        // eslint-disable-next-line no-undef
        const [client, server] = Object.values(new WebSocketPair());

        await this.handleSocketConnection(server);

        return new Response(null, { status: 101, webSocket: client });
      }

      default:
        return new Response('Not found', { status: 404 });
    }
  }
}

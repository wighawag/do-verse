const websocketHandler = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 400 });
  }
  return fetchGlobalDO(env.ROOMS, request);
};


// export for tests
export async function handleRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }
  try {
    const { patharray } = pathFromURL(request.url);

    switch (new URL(request.url).pathname) {
      case '/events/setup': // TODO should be guarded by admin authentication
      case '/events/list':
      case '/events/feed': // TODO should be guarded by admin authentication
      case '/query':
        // we only need one DO so we use _GLOBAL_ id
        const namespace = env.ETHEREUM_EVENTS;
        const DO = namespace.get(namespace.idFromName('_GLOBAL_'));

        return DO.fetch(request);
    }

    switch (patharray[0]) {
      case 'ws':
        return websocketHandler(request, env);
      default:
        return new Response('Not found', { status: 404 });
    }
  } catch (err) {
    return new Response((err as any).toString());
  }
}

const worker: ExportedHandler<Env> = { fetch: handleRequest };

import { Room } from './Room';
import { fetchGlobalDO, handleOptions, pathFromURL } from './utils/request';

// export Durable Object Classes
export { Room };

export { Blockchain as EthereumEventsDO } from './Blockchain';

// export worker
export default worker;

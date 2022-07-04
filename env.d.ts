interface Env {
  ROOMS: DurableObjectNamespace;
  ACCESS_TOKENS: KVNamespace;

  ETHEREUM_EVENTS: DurableObjectNamespace;

  ENVIRONMENT: string;
  ETHEREUM_NODE: string;
}

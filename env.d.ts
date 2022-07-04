interface Env {
  ENVIRONMENT: string;
  ETHEREUM_NODE: string;

  ETHEREUM_EVENTS: DurableObjectNamespace;
  ROOMS: DurableObjectNamespace;
  ACCESS_TOKENS: KVNamespace;
}

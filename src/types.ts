export type SocketServerErrorResponse = {
  type: "error";
  message: string;
  code: number;
  error?: any;
  stack?: any;
};

export type SocketRequestResponse<RQ, RS> = {
  request: RQ;
  response: RS | SocketServerErrorResponse;
};

export type SocketTokenSelection = SocketRequestResponse<
  { type: "select"; token: string },
  { type: "select"; token: string }
>;

export type SocketAuthentication = SocketRequestResponse<
  | {
      type: "authentication";
      method: "signature";
      owner: string;
      signature: string;
      timestamp: number;
    }
  | { type: "authentication"; method: "accessToken"; accessToken: string },
  {
    type: "authentication";
    authenticatedAddress: string;
    accessToken: { token: string; expiration: number };
  }
>;

export type SocketDeAuthentication = SocketRequestResponse<
  { type: "deauthentication" },
  { type: "deauthentication" }
>;

export type SocketRequestResponseTypes =
  | SocketTokenSelection
  | SocketAuthentication
  | SocketDeAuthentication;

export type AvatarOnServer = {
  position: { x: number; y: number; z: number };
  rotation: { rx: number; ry: number; rz: number };
  animation: string;
};
export type Avatars = {
  [tokenID: string]: AvatarOnServer;
};
export type RoomData = {
  type: "data";
  avatars: Avatars;
};

export type Move = {
  type: "move";
  tokenID: string;
  position: { x: number; y: number; z: number };
  rotation: { rx: number; ry: number; rz: number };
  animation: string;
};

export type SocketClientMessageTypes = Move;
export type SocketServerMessageTypes = RoomData | Move;

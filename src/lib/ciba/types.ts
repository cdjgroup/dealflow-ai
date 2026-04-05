export type CibaStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "error";

export interface CibaSession {
  authReqId: string;
  userId: string;
  bindingMessage: string;
  toolName: string;
  expiresAt: string;
  interval: number;
  status: CibaStatus;
  createdAt: string;
  lastPolledAt?: string;
}

export interface CibaPollResult {
  status: CibaStatus;
  accessToken?: string;
  error?: string;
}

export interface CibaInitiateResponse {
  authReqId: string;
  expiresIn: number;
  interval: number;
  bindingMessage: string;
}

export interface CibaInterrupt {
  type: "CibaInterrupt";
  authReqId: string;
  bindingMessage: string;
  expiresIn: number;
  interval: number;
}

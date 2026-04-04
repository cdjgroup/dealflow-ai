export interface ScheduledCibaSession {
  batchId: string;
  userId: string;
  authReqId: string;
  actionIds: string[];
  bindingMessage: string;
  expiresAt: string;
  interval: number;
  createdAt: string;
}

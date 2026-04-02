export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface StoredConversation {
  meta: ConversationMeta;
  messages: unknown[];
}

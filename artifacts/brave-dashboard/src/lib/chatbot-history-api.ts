// Hand-written API for the admin Chatbot History page. Bypasses Orval codegen
// on purpose (isolated additive feature), like access-api / membership-api.
import { customFetch } from "@workspace/api-client-react";

export type ChatbotHistoryListItem = {
  userId: string;
  name: string;
  email: string | null;
  niatId: string | null;
  role: string | null;
  campusName: string | null;
  questions: number;
  totalMessages: number;
  lastChattedAt: string | null;
};

export type ChatbotMessage = {
  id: number;
  role: string; // "user" | "assistant"
  message: string;
  conversationId: string | null;
  createdAt: string;
};

export type ChatbotHistoryDetail = {
  user: {
    id: string;
    name: string;
    email: string | null;
    niatId: string | null;
    role: string | null;
    campusName: string | null;
  };
  messages: ChatbotMessage[];
};

// One row per user who has chatted (question count + last-chatted time).
export function listChatbotHistory(): Promise<{
  items: ChatbotHistoryListItem[];
}> {
  return customFetch<{ items: ChatbotHistoryListItem[] }>(
    "/api/admin/chatbot-history",
  );
}

// One user's full message thread + their header info.
export function getChatbotHistoryForUser(
  userId: string,
): Promise<ChatbotHistoryDetail> {
  return customFetch<ChatbotHistoryDetail>(
    `/api/admin/chatbot-history/${encodeURIComponent(userId)}`,
  );
}

export type ChatbotHistoryExportItem = ChatbotHistoryListItem & {
  messages: ChatbotMessage[];
};

// Every user who has chatted, each with their full message thread, for a
// single bulk download (table columns + every chat message).
export function exportChatbotHistory(): Promise<{
  items: ChatbotHistoryExportItem[];
}> {
  return customFetch<{ items: ChatbotHistoryExportItem[] }>(
    "/api/admin/chatbot-history/export",
  );
}

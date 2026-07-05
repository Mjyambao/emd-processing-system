import { api } from "./api";

/*
 * Create Foundry Chat Session
 *
 * POST /api/v1/chat/conversation/session
 *
 */
export function createChatSession() {
  return api.post("/api/v1/chat/conversation/session");
}

/*
 * Processing Agent chat
 *
 * POST /api/v1/chat/message
 * 
 *  @param {string} conversation_id
 * 
 * Request Body:
 * {
		"agent_type": "processing",
		"message": "string"
	}
 */
export function processingAgentChat(conversation_id, payload) {
  return api.post(
    `/api/v1/chat/conversation/message/${encodeURIComponent(conversation_id)}`,
    payload,
  );
}

import { api } from "./api";

/*
 * Processing Agent chat
 *
 * POST /api/v1/chat/message
 * 
 * Request Body:
 * {
			"agent_type": "processing",
			"message": "string",
			"session_id": "string",
			"user_id": "string",
			"correlation_id": "string",
			"extra_arguments": {
				"additionalProp1": {}
			}
		}
 */
export function processingAgentChat(payload) {
  return api.post("/api/v1/chat/message", payload);
}

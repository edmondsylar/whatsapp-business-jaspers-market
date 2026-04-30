"use strict";

const config = require("./config");

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function alfieRequest(path, body, attempt = 0) {
  const url = `${config.alfieBaseUrl}${path}`;
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.alfieAuthToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`ALFIE network error on ${path} (attempt ${attempt + 1}), retrying in ${delay}ms:`, networkError.message);
      await sleep(delay);
      return alfieRequest(path, body, attempt + 1);
    }
    throw networkError;
  }

  if (response.ok) {
    return response.json();
  }

  if (response.status === 401) {
    const err = new Error(`ALFIE auth error 401 on ${path}`);
    err.statusCode = 401;
    console.error(err.message);
    throw err;
  }

  if (response.status === 422) {
    let detail;
    try { detail = await response.json(); } catch (_) { detail = null; }
    const err = new Error(`ALFIE validation error 422 on ${path}`);
    err.statusCode = 422;
    err.detail = detail;
    console.error(err.message, detail);
    throw err;
  }

  if (response.status >= 500) {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`ALFIE server error ${response.status} on ${path} (attempt ${attempt + 1}), retrying in ${delay}ms`);
      await sleep(delay);
      return alfieRequest(path, body, attempt + 1);
    }
    const err = new Error(`ALFIE server error ${response.status} on ${path} after ${MAX_RETRIES} retries`);
    err.statusCode = response.status;
    throw err;
  }

  const err = new Error(`ALFIE unexpected status ${response.status} on ${path}`);
  err.statusCode = response.status;
  throw err;
}

module.exports = class AlfieClient {
  /**
   * Send a user message to the ALFIE agent.
   * @param {string} message - The user's text message
   * @param {string} userId - Stable ALFIE user identity (WhatsApp phone number)
   * @param {string|null} conversationId - Existing conversation ID, or null for a new thread
   * @param {string} sessionId - Session bucket (defaults to __general__)
   * @returns {Promise<{response: string, screen_text: string, conversation_id: string}>}
   */
  static async callAgent(message, userId, conversationId, sessionId) {
    const body = {
      message,
      user_id: userId,
      provider: config.alfieProvider,
      model: config.alfieModel,
      conversation_id: conversationId || null,
      session_id: sessionId || "__general__",
      load_history: true,
      history_limit: 250,
      images: null,
      use_speech: false,
      latitude: null,
      longitude: null,
    };

    return alfieRequest("/api/alfie/backend/agent", body);
  }

  /**
   * Persist a message (user or assistant) to ALFIE storage.
   * @param {string} conversationId - The conversation ID
   * @param {string} sessionId - The session ID
   * @param {'user'|'assistant'} role - Message role
   * @param {string} content - Message text
   * @param {string|null} waMessageId - Original WhatsApp message ID (for user messages)
   * @returns {Promise<{message_id: string}>}
   */
  static async saveMessage(conversationId, sessionId, role, content, waMessageId = null) {
    const body = {
      conversation_id: conversationId,
      session_id: sessionId || "__general__",
      role,
      content,
      metadata: {
        channel: "whatsapp",
        ...(waMessageId ? { wa_message_id: waMessageId } : {}),
      },
      model: null,
      tokens: null,
    };

    return alfieRequest("/api/messages", body);
  }
};

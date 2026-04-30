/**
 * Copyright 2021-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";

const redis = require('redis');
const config = require('./config');

const client = redis.createClient({
  socket: {
    host: config.redisHost,
    port: config.redisPort
  }
});

client.on('error', (err) => {
  console.error('Redis Client Error', err);
});

client.connect();

module.exports = class Cache {
    static async insert(key) {
        /**
         * As of when this was written, the redis client doesn't support
         * setting a TTL on members of the set dataytype. Instead, we'll
         * use the standard hash map with a dummy value to mimic one.
        */
        await client.set(key, "");

        // Assume that most "delivered / read" webhooks will happen within
        // 15 seconds.
        await client.expire(key, 15);
    }

    static async remove(key) {
        let resp = await client.del(key);

        /**
         * Optionally, your application can measure / report the ingress latency
         * from Cloud API webhooks via Redis's TTL.
         * Ex.
         *      someLoggingFunc(client.ttl(key));
        */

        return resp > 0;
    }

    /**
     * Retrieve the stored ALFIE context for a WhatsApp phone number.
     * @param {string} waPhone - The sender's WhatsApp phone number
     * @returns {Promise<{user_id: string, session_id: string, conversation_id: string|null}|null>}
     */
    static async getContext(waPhone) {
        const raw = await client.get(`alfie:ctx:${waPhone}`);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    /**
     * Persist the ALFIE context for a WhatsApp phone number (no TTL).
     * @param {string} waPhone - The sender's WhatsApp phone number
     * @param {{user_id: string, session_id: string, conversation_id: string|null}} context
     */
    static async saveContext(waPhone, context) {
        await client.set(`alfie:ctx:${waPhone}`, JSON.stringify(context));
    }
}

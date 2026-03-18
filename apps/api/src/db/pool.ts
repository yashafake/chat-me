import fs from "node:fs/promises";
import path from "node:path";

import { Client, Pool, types } from "pg";

import type { AppConfig } from "../config.js";

types.setTypeParser(20, (value) => Number.parseInt(value, 10));

export interface ChatRealtimeEvent {
  type: "conversation.updated";
  conversationId: number;
  projectKey: string;
  messageId?: number;
  occurredAt: string;
}

type Subscriber = (event: ChatRealtimeEvent) => void;

export class ChatEventHub {
  private readonly conversationSubscribers = new Map<number, Set<Subscriber>>();

  subscribeConversation(conversationId: number, subscriber: Subscriber): () => void {
    const existing = this.conversationSubscribers.get(conversationId) ?? new Set<Subscriber>();
    existing.add(subscriber);
    this.conversationSubscribers.set(conversationId, existing);

    return () => {
      existing.delete(subscriber);

      if (existing.size === 0) {
        this.conversationSubscribers.delete(conversationId);
      }
    };
  }

  emit(event: ChatRealtimeEvent): void {
    const subscribers = this.conversationSubscribers.get(event.conversationId);

    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }
}

export function createPool(config: AppConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 20
  });
}

export async function runSchema(pool: Pool): Promise<void> {
  const schemaPath = path.resolve(process.cwd(), "src/db/schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(786401)");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createRealtimeBridge(config: AppConfig, hub: ChatEventHub): Promise<{
  publish(event: ChatRealtimeEvent): Promise<void>;
  close(): Promise<void>;
}> {
  const listener = new Client({
    connectionString: config.databaseUrl
  });

  await listener.connect();
  await listener.query("LISTEN chat_events");
  listener.on("notification", (message) => {
    if (!message.payload) {
      return;
    }

    try {
      const payload = JSON.parse(message.payload) as ChatRealtimeEvent;
      hub.emit(payload);
    } catch {
      return;
    }
  });

  const publisher = new Client({
    connectionString: config.databaseUrl
  });

  await publisher.connect();

  return {
    async publish(event) {
      await publisher.query("SELECT pg_notify($1, $2)", ["chat_events", JSON.stringify(event)]);
    },
    async close() {
      await listener.end();
      await publisher.end();
    }
  };
}

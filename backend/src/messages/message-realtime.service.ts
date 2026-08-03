import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { WebSocket, WebSocketServer } from 'ws';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { AuthService } from '../auth/auth.service.js';
import type { AppEnvironment } from '../config/environment.js';

export type RealtimeEvent = {
  type:
    | 'message.created'
    | 'conversation.updated'
    | 'unread.updated'
    | 'read.updated';
  data: Record<string, unknown>;
};

type UpgradeListener = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

type UpgradeServer = {
  on(event: 'upgrade', listener: UpgradeListener): void;
  off(event: 'upgrade', listener: UpgradeListener): void;
};

@Injectable()
export class MessageRealtimeService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly server = new WebSocketServer({ noServer: true });
  private readonly clients = new Map<string, Set<WebSocket>>();
  private heartbeat: NodeJS.Timeout | null = null;
  private httpServer: UpgradeServer | null = null;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ConfigService)
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  onApplicationBootstrap(): void {
    this.httpServer =
      this.adapterHost.httpAdapter.getHttpServer() as UpgradeServer;
    this.httpServer.on('upgrade', this.handleUpgrade);
    this.heartbeat = setInterval(() => {
      for (const sockets of this.clients.values()) {
        for (const socket of sockets) {
          if (socket.readyState !== WebSocket.OPEN) continue;
          try {
            socket.ping();
          } catch {
            socket.terminate();
          }
        }
      }
    }, 30_000);
    this.heartbeat.unref();
  }

  onModuleDestroy(): void {
    this.httpServer?.off('upgrade', this.handleUpgrade);
    this.httpServer = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const sockets of this.clients.values()) {
      for (const socket of sockets) socket.close(1001, 'server shutdown');
    }
    this.server.close();
  }

  publish(userId: string, event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.clients.get(userId) ?? []) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      try {
        socket.send(payload, () => undefined);
      } catch {
        // Persistence is authoritative; HTTP success must not depend on push.
      }
    }
  }

  private readonly handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    void this.authenticateUpgrade(request)
      .then((userId) => {
        if (!userId) {
          this.reject(socket, 401, 'Unauthorized');
          return;
        }
        this.server.handleUpgrade(request, socket, head, (webSocket) => {
          const userSockets = this.clients.get(userId) ?? new Set<WebSocket>();
          userSockets.add(webSocket);
          this.clients.set(userId, userSockets);
          webSocket.on('close', () => {
            userSockets.delete(webSocket);
            if (userSockets.size === 0) this.clients.delete(userId);
          });
          webSocket.on('error', () => undefined);
        });
      })
      .catch(() => this.reject(socket, 401, 'Unauthorized'));
  };

  private async authenticateUpgrade(
    request: IncomingMessage,
  ): Promise<string | null> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/v1/messages/ws') return null;
    const origin = request.headers.origin;
    if (!origin || !this.allowedOrigins().has(origin)) return null;
    const sessionId = this.cookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionId) await this.auth.assertWriteAllowed(sessionId);
    const user = await this.auth.currentUser(sessionId);
    return user?.id ?? null;
  }

  private allowedOrigins(): Set<string> {
    const configured = new URL(this.config.getOrThrow('FRONTEND_ORIGIN'));
    const origins = new Set([configured.origin]);
    if (this.config.getOrThrow('NODE_ENV') !== 'production') {
      if (configured.hostname === '127.0.0.1') {
        configured.hostname = 'localhost';
        origins.add(configured.origin);
      } else if (configured.hostname === 'localhost') {
        configured.hostname = '127.0.0.1';
        origins.add(configured.origin);
      }
    }
    return origins;
  }

  private cookie(header: string | undefined, name: string): string | undefined {
    for (const pair of header?.split(';') ?? []) {
      const separator = pair.indexOf('=');
      if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
      return decodeURIComponent(pair.slice(separator + 1).trim());
    }
    return undefined;
  }

  private reject(socket: Duplex, status: number, text: string): void {
    if (!socket.destroyed) {
      socket.write(
        `HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
      socket.destroy();
    }
  }
}

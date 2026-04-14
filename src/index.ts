#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import 'dotenv/config';
import express from 'express';

import { TIMEZONE_SHANGHAI, SEARCH_TIME_TEXT_FORMAT, ISO_8601_TIME_FORMAT } from './constants';
import { registerAlarmTools } from './tools/alarm';
import { registerLogSearchTools } from './tools/log-search';
import { registerMetricTools } from './tools/metric';
import { registerUtilityTools } from './tools/utility';
import { createClsClient } from './utils';

export { TIMEZONE_SHANGHAI, SEARCH_TIME_TEXT_FORMAT, ISO_8601_TIME_FORMAT };

function createMcpServer() {
  const mcpServer = new McpServer({
    name: 'cls-mcp-server',
    version: '1.0.0',
  });

  registerLogSearchTools(mcpServer, createClsClient);
  registerMetricTools(mcpServer, createClsClient);
  registerAlarmTools(mcpServer, createClsClient);
  registerUtilityTools(mcpServer, createClsClient);

  return mcpServer;
}

export { createMcpServer };

function main() {
  const transport = process.env.TRANSPORT;
  if (transport === 'sse') {
    const app = express();
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;

    const SESSION_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 分钟无消息则视为空闲
    const HEARTBEAT_INTERVAL = 30_000; // 30 秒心跳

    interface Session {
      transport: SSEServerTransport;
      lastActiveAt: number;
      heartbeat: ReturnType<typeof setInterval>;
      idleTimer: ReturnType<typeof setTimeout>;
    }
    const sessions = new Map<string, Session>();

    /** 关闭并清理指定 session */
    function closeSession(sessionId: string, reason: string) {
      const session = sessions.get(sessionId);
      if (!session) return;
      clearInterval(session.heartbeat);
      clearTimeout(session.idleTimer);
      sessions.delete(sessionId);
      session.transport.close().catch(() => {});
      console.log(`[MCP] Session ${reason}: ${sessionId}, remaining: ${sessions.size}`);
    }

    /** 重置空闲计时器，超时后主动断开连接 */
    function resetIdleTimer(sessionId: string) {
      const session = sessions.get(sessionId);
      if (!session) return;
      clearTimeout(session.idleTimer);
      session.lastActiveAt = Date.now();
      session.idleTimer = setTimeout(() => {
        closeSession(sessionId, 'idle timeout');
      }, SESSION_IDLE_TIMEOUT);
    }

    // SSE 连接端点
    app.get('/sse', (req, res) => {
      const sseTransport = new SSEServerTransport('/messages', res);
      const server = createMcpServer();
      const { sessionId } = sseTransport;

      // 心跳保活，防止反向代理/网关因超时断开长连接
      const heartbeat = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch {
          closeSession(sessionId, 'heartbeat write error');
        }
      }, HEARTBEAT_INTERVAL);

      // 空闲超时计时器
      const idleTimer = setTimeout(() => {
        closeSession(sessionId, 'idle timeout');
      }, SESSION_IDLE_TIMEOUT);

      sessions.set(sessionId, {
        transport: sseTransport,
        lastActiveAt: Date.now(),
        heartbeat,
        idleTimer,
      });

      console.log(`[MCP] Session created: ${sessionId}, total: ${sessions.size}`);

      // 连接关闭清理（客户端主动断开时触发）
      res.on('close', () => {
        closeSession(sessionId, 'closed by client');
      });

      server.connect(sseTransport).catch((error) => {
        closeSession(sessionId, 'connect error');
        console.error('Fatal error in main():', error);
        process.exit(error?.code || 1);
      });
    });

    // 消息端点
    app.post('/messages', (req, res) => {
      const sessionId = req.query.sessionId as string;
      const session = sessions.get(sessionId);
      if (session) {
        // 收到消息，重置空闲计时器
        resetIdleTimer(sessionId);
        session.transport.handlePostMessage(req, res);
      } else {
        console.warn(`[MCP] Session not found: ${sessionId}, active sessions: ${sessions.size}`);
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session not found. The SSE connection may have been closed. Please reconnect to /sse.',
          },
          id: null,
        });
      }
    });

    // 健康检查端点
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', activeSessions: sessions.size });
    });

    app.listen(port);

    console.log(`Started cls-mcp-server in sse transport on port ${port}.`);

    // 优雅关闭：主动关闭所有 SSE 连接，让客户端感知到断开并触发重连
    const gracefulShutdown = async () => {
      console.log(`[MCP] Shutting down, closing ${sessions.size} active sessions...`);
      await Promise.allSettled(
        Array.from(sessions.keys()).map((id) => {
          closeSession(id, 'server shutdown');
        }),
      );
      sessions.clear();
      process.exit(0);
    };
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on('SIGTERM', gracefulShutdown);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on('SIGINT', gracefulShutdown);
  } else {
    const stdioTransport = new StdioServerTransport();
    const server = createMcpServer();
    server
      .connect(stdioTransport)
      .then(() => {
        console.log('Started cls-mcp-server in stdio transport.');
      })
      .catch((error) => {
        console.error('Fatal error in main():', error);
        process.exit(error?.code || 1);
      });
  }
}

if (process.env.NODE_ENV !== 'test') {
  main();
}

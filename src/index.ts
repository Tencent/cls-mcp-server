#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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

/**
 * 解析端口号:非合法整数(NaN/<=0/>=65536)时回退到 fallback 并打印 warning。
 * 防止 `Number("abc") === NaN` 时 app.listen(NaN) 静默绑定到随机端口、排障困难。
 */
export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  console.warn(`[MCP] Invalid PORT value "${value}", falling back to ${fallback}.`);
  return fallback;
}

/**
 * 构建 Streamable HTTP 模式下的 Express 应用,以无状态模式运行:
 * 每个 POST /mcp 请求独立创建 McpServer + Transport,请求结束即释放,
 * 无需维护会话、心跳、空闲超时等状态,天然支持水平扩容。
 *
 * 不调用 listen,便于测试用 supertest 或 SDK Client 直接打。
 */
export function createHttpApp(): express.Application {
  const app = express();

  // body parser 仅挂在 /mcp 路由级,/health 不解析 body
  app.post('/mcp', express.json({ limit: '4mb' }), async (req, res) => {
    const server = createMcpServer();
    const streamTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // 无状态模式
    });

    // 请求结束或客户端断开时,释放本次请求对应的 transport/server 资源
    res.on('close', () => {
      streamTransport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(streamTransport);
      await streamTransport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[MCP] streamable-http request error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // 无状态模式下不支持 GET(服务端→客户端推送)与 DELETE(终止会话),按规范返回 405
  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed in stateless mode.' },
      id: null,
    });
  };
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  // 健康检查端点
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

/**
 * 启动 Streamable HTTP server,绑定优雅关闭。
 * @param port 监听端口,默认从 process.env.PORT 解析或回退 3000
 * @param registerSignals 是否注册 SIGTERM/SIGINT。测试场景应传 false 避免污染。
 * @returns http.Server 实例,测试中可直接 close()
 */
export function startHttpServer(port?: number, registerSignals = true) {
  const app = createHttpApp();
  const resolvedPort = port ?? parsePort(process.env.PORT, 3000);
  const httpServer = app.listen(resolvedPort);

  httpServer.on('listening', () => {
    const addr = httpServer.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : resolvedPort;
    console.log(`Started cls-mcp-server in streamable-http transport on port ${actualPort}.`);
  });
  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    console.error(`[MCP] Failed to listen on port ${resolvedPort}:`, error?.code || error);
    process.exit(1);
  });

  // 优雅关闭:
  //  1) close() 停止接受新连接,等待飞行中的请求结束
  //  2) closeIdleConnections() 立即关空闲 keep-alive 连接,避免它们撑满 grace period
  //  3) 15s 后 closeAllConnections() 强关仍存活的连接
  //  4) 25s 兜底 process.exit,略小于 K8s 默认 grace period (30s)
  const gracefulShutdown = () => {
    console.log('[MCP] Shutting down streamable-http server...');
    httpServer.close(() => process.exit(0));
    httpServer.closeIdleConnections();
    setTimeout(() => {
      console.warn('[MCP] Forcing close of all remaining connections.');
      httpServer.closeAllConnections();
    }, 15_000).unref();
    setTimeout(() => {
      console.warn('[MCP] Graceful shutdown timed out, forcing exit.');
      process.exit(0);
    }, 25_000).unref();
  };

  if (registerSignals) {
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }

  return httpServer;
}

function main() {
  const transport = process.env.TRANSPORT;
  if (transport === 'sse') {
    const app = express();
    const port = parsePort(process.env.PORT, 3000);

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
  } else if (transport === 'http' || transport === 'streamable-http') {
    if (transport === 'streamable-http') {
      console.warn('[MCP] TRANSPORT="streamable-http" is deprecated, please use TRANSPORT="http" instead.');
    }
    startHttpServer();
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

import type { AddressInfo } from 'node:net';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// 复用 log-enhancement-tools.test.ts 的 mock 模式：在 import 业务代码前 mock 掉腾讯云 SDK
let createHttpApp: typeof import('../index.js')['createHttpApp'];
let parsePort: typeof import('../index.js')['parsePort'];

// 全文件共用一个 server,避免反复 listen/close 触发 Node fetch 的 keep-alive 连接池 race
let baseUrl = '';
let stopServer: () => Promise<void> = async () => {};

beforeAll(async () => {
  vi.doMock('tencentcloud-sdk-nodejs-cls', () => {
    const MockClient = function () {
      return {
        DescribeIndex: vi.fn(),
        DescribeLogHistogram: vi.fn(),
        SearchLog: vi.fn(),
        DescribeLogContext: vi.fn(),
        DescribeTopics: vi.fn(),
        QueryMetric: vi.fn(),
        QueryRangeMetric: vi.fn(),
        DescribeAlarms: vi.fn(),
        DescribeAlertRecordHistory: vi.fn(),
        GetAlarmLog: vi.fn(),
        DescribeAlarmNotices: vi.fn(),
        DescribeAlarmShields: vi.fn(),
        DescribeNoticeContents: vi.fn(),
        DescribeWebCallbacks: vi.fn(),
        request: vi.fn(),
        sdkVersion: '',
      };
    };
    return { cls: { v20201016: { Client: MockClient } } };
  });
  vi.doMock('tencentcloud-sdk-nodejs-region', () => {
    const MockClient = function () {
      return {
        DescribeRegions: vi.fn().mockResolvedValue({ RegionSet: [] }),
        sdkVersion: '',
      };
    };
    return { region: { v20220627: { Client: MockClient } } };
  });

  const mod = await import('../index.js');
  createHttpApp = mod.createHttpApp;
  parsePort = mod.parsePort;

  // 启动一个监听随机端口的 server,所有测试共享。
  // listen(0) 让 OS 分配端口,避免 CI 端口冲突。
  const app = createHttpApp();
  const httpServer = app.listen(0);
  await new Promise<void>((resolve) => httpServer.once('listening', resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  stopServer = () =>
    new Promise<void>((resolve) => {
      httpServer.closeAllConnections();
      httpServer.close(() => resolve());
    });
});

afterAll(async () => {
  await stopServer();
});

// ==================== parsePort ====================

describe('parsePort', () => {
  it('undefined / 空字符串回退到 fallback', () => {
    expect(parsePort(undefined, 3000)).toBe(3000);
    expect(parsePort('', 3000)).toBe(3000);
  });

  it('合法整数原样返回', () => {
    expect(parsePort('8080', 3000)).toBe(8080);
    expect(parsePort('1', 3000)).toBe(1);
    expect(parsePort('65535', 3000)).toBe(65535);
  });

  it('非数字 / 越界 / 浮点数回退到 fallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parsePort('abc', 3000)).toBe(3000);
    expect(parsePort('0', 3000)).toBe(3000);
    expect(parsePort('-1', 3000)).toBe(3000);
    expect(parsePort('65536', 3000)).toBe(3000);
    expect(parsePort('80.5', 3000)).toBe(3000);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ==================== HTTP 路由层 ====================

describe('HTTP transport - 健康检查与 405', () => {
  it('GET /health 返回 ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('GET /mcp 返回 405 + JSON-RPC envelope', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: 'GET' });
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error?.code).toBe(-32000);
    expect(typeof body.error?.message).toBe('string');
  });

  it('DELETE /mcp 返回 405 + JSON-RPC envelope', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error?.code).toBe(-32000);
  });

  it('POST /mcp 超过 4mb body 返回 413', { timeout: 30_000 }, async () => {
    // express.json 默认对超限 body 抛 PayloadTooLargeError -> 413
    const big = 'x'.repeat(5 * 1024 * 1024);
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { big } }),
    });
    expect(res.status).toBe(413);
  });
});

// ==================== MCP 协议链路 ====================

async function newConnectedClient(name = 'http-test-client'): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  const client = new Client({ name, version: '1.0.0' });
  await client.connect(transport);
  return client;
}

describe('HTTP transport - MCP 协议链路', () => {
  it('initialize + tools/list 拿到工具清单', async () => {
    const client = await newConnectedClient();
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
      // ConvertTimeStringToTimestamp 不依赖外部 SDK,最稳
      const names = tools.map((t) => t.name);
      expect(names).toContain('ConvertTimeStringToTimestamp');
    } finally {
      await client.close().catch(() => {});
    }
  });

  it('callTool 链路 — ConvertTimeStringToTimestamp 正常返回', async () => {
    const client = await newConnectedClient();
    try {
      const result = await client.callTool({
        name: 'ConvertTimeStringToTimestamp',
        arguments: { timeString: '2024-01-01T00:00:00.000+08:00' },
      });
      expect(result.isError).toBeFalsy();
      const { text } = (result.content as { text: string }[])[0];
      // 该工具默认返回毫秒级时间戳的 JSON
      expect(text).toMatch(/\d+/);
    } finally {
      await client.close().catch(() => {});
    }
  });

  it('参数校验失败时通过 JSON-RPC error 返回,而非 HTTP 500', async () => {
    const client = await newConnectedClient();
    try {
      // ConvertTimeStringToTimestamp 不传 timeString,应该走 zod 校验失败路径,
      // SDK 会把它包装成 isError=true 的 CallToolResult,而非 HTTP 层错误
      const result = await client.callTool({
        name: 'ConvertTimeStringToTimestamp',
        arguments: {},
      });
      expect(result.isError).toBe(true);
    } finally {
      await client.close().catch(() => {});
    }
  });
});

// ==================== 资源释放 ====================

describe('HTTP transport - 资源释放', () => {
  it('多次连接断开不会触发 unhandledRejection', { timeout: 15_000 }, async () => {
    // res.on('close') 回调会在响应结束时触发 streamTransport.close + server.close,
    // 若内部抛错会污染 unhandledRejection。这里串行跑 3 次,确认无泄漏。
    const unhandled: unknown[] = [];
    const handler = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', handler);

    try {
      for (let i = 0; i < 3; i++) {
        const client = await newConnectedClient(`leak-check-${i}`);
        await client.listTools();
        await client.close();
      }
      // 给事件循环一拍,让 res.on('close') 回调完成
      await new Promise((r) => setTimeout(r, 100));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', handler);
    }
  });
});

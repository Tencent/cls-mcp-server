import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createMcpServer } from '../index.js';

async function createTestClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer().connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, serverTransport };
}

function parseResult(result: Awaited<ReturnType<Client['callTool']>>) {
  const { text } = (result.content as { text: string }[])[0];
  return JSON.parse(text);
}

function getRawText(result: Awaited<ReturnType<Client['callTool']>>) {
  return (result.content as { text: string }[])[0].text;
}

describe('ConvertTimeStringToTimestamp', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    await serverTransport.close();
  });

  it('不传 unit，默认返回毫秒级时间戳', async () => {
    const result = await client.callTool({
      name: 'ConvertTimeStringToTimestamp',
      arguments: { timeString: '2024-01-01T00:00:00.000+08:00' },
    });
    const ts = parseResult(result);
    expect(typeof ts).toBe('number');
    expect(ts).toBe(1704038400000);
  });

  it('unit=milliseconds，返回毫秒级时间戳', async () => {
    const result = await client.callTool({
      name: 'ConvertTimeStringToTimestamp',
      arguments: { timeString: '2024-01-01T00:00:00.000+08:00', unit: 'milliseconds' },
    });
    expect(parseResult(result)).toBe(1704038400000);
  });

  it('unit=seconds，返回秒级时间戳', async () => {
    const result = await client.callTool({
      name: 'ConvertTimeStringToTimestamp',
      arguments: { timeString: '2024-01-01T00:00:00.000+08:00', unit: 'seconds' },
    });
    expect(parseResult(result)).toBe(1704038400);
  });

  it('seconds 结果 * 1000 等于 milliseconds 结果', async () => {
    const args = { timeString: '2025-06-15T12:30:00.000+08:00' };
    const [msResult, secResult] = await Promise.all([
      client.callTool({ name: 'ConvertTimeStringToTimestamp', arguments: { ...args, unit: 'milliseconds' } }),
      client.callTool({ name: 'ConvertTimeStringToTimestamp', arguments: { ...args, unit: 'seconds' } }),
    ]);
    expect(parseResult(secResult) * 1000).toBe(parseResult(msResult));
  });

  it('指定 timeZone，按对应时区解析时间字符串', async () => {
    const [shanghaiResult, utcResult] = await Promise.all([
      client.callTool({
        name: 'ConvertTimeStringToTimestamp',
        arguments: {
          timeString: '2024-01-01 00:00:00.000',
          timeFormat: 'YYYY-MM-DD HH:mm:ss.SSS',
          timeZone: 'Asia/Shanghai',
        },
      }),
      client.callTool({
        name: 'ConvertTimeStringToTimestamp',
        arguments: { timeString: '2024-01-01 00:00:00.000', timeFormat: 'YYYY-MM-DD HH:mm:ss.SSS', timeZone: 'UTC' },
      }),
    ]);
    // 上海比 UTC 早 8 小时，时间戳更小
    expect(parseResult(shanghaiResult)).toBeLessThan(parseResult(utcResult));
    expect(parseResult(utcResult) - parseResult(shanghaiResult)).toBe(8 * 60 * 60 * 1000);
  });

  it('指定自定义 timeFormat，正确解析非 ISO 时间字符串', async () => {
    const result = await client.callTool({
      name: 'ConvertTimeStringToTimestamp',
      arguments: {
        timeString: '2024-01-01 08:00:00',
        timeFormat: 'YYYY-MM-DD HH:mm:ss',
        timeZone: 'UTC',
        unit: 'seconds',
      },
    });
    expect(parseResult(result)).toBe(1704096000);
  });
});

describe('ConvertTimestampToTimeString', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    await serverTransport.close();
  });

  it('不传 timestamp，返回当前时间', async () => {
    const before = Date.now();
    const result = await client.callTool({
      name: 'ConvertTimestampToTimeString',
      arguments: {},
    });
    const after = Date.now();
    const ts = new Date(parseResult(result) as string).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 5000);
    expect(ts).toBeLessThanOrEqual(after + 5000);
  });

  it('unit=milliseconds，输入毫秒时间戳正确转换', async () => {
    const result = await client.callTool({
      name: 'ConvertTimestampToTimeString',
      arguments: { timestamp: 1704038400000, unit: 'milliseconds', timeZone: 'Asia/Shanghai' },
    });
    expect(parseResult(result) as string).toMatch(/^2024-01-01/);
  });

  it('unit=seconds，输入秒级时间戳正确转换', async () => {
    const result = await client.callTool({
      name: 'ConvertTimestampToTimeString',
      arguments: { timestamp: 1704038400, unit: 'seconds', timeZone: 'Asia/Shanghai' },
    });
    expect(parseResult(result) as string).toMatch(/^2024-01-01/);
  });

  it('unit=milliseconds 与 unit=seconds 传入等价时间戳，输出一致', async () => {
    const [msResult, secResult] = await Promise.all([
      client.callTool({
        name: 'ConvertTimestampToTimeString',
        arguments: { timestamp: 1704038400000, unit: 'milliseconds', timeZone: 'Asia/Shanghai' },
      }),
      client.callTool({
        name: 'ConvertTimestampToTimeString',
        arguments: { timestamp: 1704038400, unit: 'seconds', timeZone: 'Asia/Shanghai' },
      }),
    ]);
    expect(parseResult(msResult)).toBe(parseResult(secResult));
  });

  it('指定 timeZone，输出对应时区的时间', async () => {
    const result = await client.callTool({
      name: 'ConvertTimestampToTimeString',
      arguments: { timestamp: 1704038400000, unit: 'milliseconds', timeZone: 'UTC' },
    });
    // 1704038400000 = 2023-12-31T16:00:00 UTC
    expect(parseResult(result) as string).toMatch(/^2023-12-31/);
  });

  it('指定自定义 timeFormat，输出对应格式', async () => {
    const result = await client.callTool({
      name: 'ConvertTimestampToTimeString',
      arguments: {
        timestamp: 1704038400000,
        unit: 'milliseconds',
        timeZone: 'Asia/Shanghai',
        timeFormat: 'YYYY-MM-DD',
      },
    });
    expect(parseResult(result)).toBe('2024-01-01');
  });

  it('seconds 往返转换后秒级精度一致', async () => {
    const original = '2025-06-15T12:30:00.000+08:00';
    const secTs = parseResult(
      await client.callTool({
        name: 'ConvertTimeStringToTimestamp',
        arguments: { timeString: original, unit: 'seconds' },
      }),
    ) as number;
    const restored = parseResult(
      await client.callTool({
        name: 'ConvertTimestampToTimeString',
        arguments: { timestamp: secTs, unit: 'seconds', timeZone: 'Asia/Shanghai' },
      }),
    ) as string;
    expect(original.slice(0, 19)).toBe(restored.slice(0, 19));
  });
});

describe('MAX_LENGTH 截断', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await serverTransport.close();
  });

  it('结果超过 MAX_LENGTH 时，输出被截断并附加 ...(truncated)', async () => {
    vi.stubEnv('MAX_LENGTH', '10');
    const result = await client.callTool({
      name: 'ConvertTimestampToTimeString',
      arguments: { timestamp: 1704038400000, unit: 'milliseconds', timeZone: 'Asia/Shanghai' },
    });
    const text = getRawText(result);
    expect(text.endsWith('...(truncated)')).toBe(true);
    expect(text.length).toBe(10 + '...(truncated)'.length);
  });

  it('结果未超过 MAX_LENGTH 时，输出不截断', async () => {
    vi.stubEnv('MAX_LENGTH', '10000');
    const result = await client.callTool({
      name: 'ConvertTimestampToTimeString',
      arguments: { timestamp: 1704038400000, unit: 'milliseconds', timeZone: 'Asia/Shanghai' },
    });
    expect(getRawText(result)).not.toContain('...(truncated)');
  });
});

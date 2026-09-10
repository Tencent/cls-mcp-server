import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const mockDescribeIndex = vi.fn();
const mockDescribeLogHistogram = vi.fn();
const mockChatCompletions = vi.fn();

let createMcpServer: typeof import('../index.js')['createMcpServer'];

beforeAll(async () => {
  vi.doMock('tencentcloud-sdk-nodejs-cls', () => {
    const MockClient = function () {
      return {
        DescribeIndex: mockDescribeIndex,
        DescribeLogHistogram: mockDescribeLogHistogram,
        ChatCompletions: mockChatCompletions,
        SearchLog: vi.fn(),
        DescribeLogContext: vi.fn(),
        DescribeTopics: vi.fn(),
        DescribeLogsets: vi.fn(),
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
  createMcpServer = mod.createMcpServer;
});

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

// ==================== DescribeIndex ====================

describe('DescribeIndex', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    await serverTransport.close();
  });

  it('不传 Region，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'DescribeIndex',
      arguments: { TopicId: 'topic-123' },
    });
    expect(result.isError).toBe(true);
  });

  it('TopicId 正确透传给 SDK', async () => {
    mockDescribeIndex.mockResolvedValue({
      TopicId: 'topic-123',
      Rule: { FullText: { CaseSensitive: false } },
      RequestId: 'req-1',
    });
    await client.callTool({
      name: 'DescribeIndex',
      arguments: { Region: 'ap-guangzhou', TopicId: 'topic-123' },
    });
    expect(mockDescribeIndex).toHaveBeenCalledOnce();
    expect(mockDescribeIndex.mock.calls[0][0].TopicId).toBe('topic-123');
  });

  it('SDK 调用成功，返回索引配置', async () => {
    mockDescribeIndex.mockResolvedValue({
      TopicId: 'topic-123',
      Rule: {
        FullText: { CaseSensitive: false, Tokenizer: '' },
        KeyValue: {
          CaseSensitive: false,
          KeyValues: [{ Key: 'level', Value: { Type: 'text', SqlFlag: true } }],
        },
      },
      Status: true,
      RequestId: 'req-2',
    });
    const result = await client.callTool({
      name: 'DescribeIndex',
      arguments: { Region: 'ap-guangzhou', TopicId: 'topic-123' },
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result).TopicId).toBe('topic-123');
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockDescribeIndex.mockRejectedValue(new Error('IndexNotFound'));
    const result = await client.callTool({
      name: 'DescribeIndex',
      arguments: { Region: 'ap-guangzhou', TopicId: 'topic-404' },
    });
    expect(result.isError).toBe(true);
  });
});

// ==================== DescribeLogHistogram ====================

describe('DescribeLogHistogram', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    await serverTransport.close();
  });

  it('不传 Region，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'DescribeLogHistogram',
      arguments: { TopicId: 'topic-123', From: 1704038400000, To: 1704042000000, Query: '*' },
    });
    expect(result.isError).toBe(true);
  });

  it('必填参数正确透传给 SDK', async () => {
    mockDescribeLogHistogram.mockResolvedValue({
      Interval: 60000,
      TotalCount: 100,
      HistogramInfos: [{ Count: 10, BTime: 1704038400000 }],
      RequestId: 'req-3',
    });
    await client.callTool({
      name: 'DescribeLogHistogram',
      arguments: {
        Region: 'ap-guangzhou',
        TopicId: 'topic-123',
        From: 1704038400000,
        To: 1704042000000,
        Query: 'level:ERROR',
      },
    });
    expect(mockDescribeLogHistogram).toHaveBeenCalledOnce();
    const params = mockDescribeLogHistogram.mock.calls[0][0];
    expect(params.TopicId).toBe('topic-123');
    expect(params.From).toBe(1704038400000);
    expect(params.To).toBe(1704042000000);
    expect(params.Query).toBe('level:ERROR');
    expect(params.SyntaxRule).toBe(1);
  });

  it('Interval 参数正确透传', async () => {
    mockDescribeLogHistogram.mockResolvedValue({
      Interval: 300000,
      TotalCount: 50,
      HistogramInfos: [],
      RequestId: 'req-4',
    });
    await client.callTool({
      name: 'DescribeLogHistogram',
      arguments: {
        Region: 'ap-guangzhou',
        TopicId: 'topic-123',
        From: 1704038400000,
        To: 1704042000000,
        Query: '*',
        Interval: 300000,
      },
    });
    expect(mockDescribeLogHistogram.mock.calls[0][0].Interval).toBe(300000);
  });

  it('SDK 调用成功，返回直方图数据', async () => {
    mockDescribeLogHistogram.mockResolvedValue({
      Interval: 60000,
      TotalCount: 200,
      HistogramInfos: [
        { Count: 50, BTime: 1704038400000 },
        { Count: 150, BTime: 1704038460000 },
      ],
      RequestId: 'req-5',
    });
    const result = await client.callTool({
      name: 'DescribeLogHistogram',
      arguments: {
        Region: 'ap-guangzhou',
        TopicId: 'topic-123',
        From: 1704038400000,
        To: 1704042000000,
        Query: '*',
      },
    });
    expect(result.isError).toBeFalsy();
    const data = parseResult(result);
    expect(data.TotalCount).toBe(200);
    expect(data.HistogramInfos).toHaveLength(2);
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockDescribeLogHistogram.mockRejectedValue(new Error('InvalidParam'));
    const result = await client.callTool({
      name: 'DescribeLogHistogram',
      arguments: {
        Region: 'ap-guangzhou',
        TopicId: 'topic-123',
        From: 1704038400000,
        To: 1704042000000,
        Query: '*',
      },
    });
    expect(result.isError).toBe(true);
  });
});

// ==================== TextToSearchLogQuery ====================

/** 从 TextToSearchLogQuery 响应文本中提取首行 SessionId */
function extractSessionId(result: Awaited<ReturnType<Client['callTool']>>): string {
  const { text } = (result.content as { text: string }[])[0];
  const m = /^SessionId: (.+)\n/.exec(text);
  expect(m).not.toBeNull();
  return m![1];
}

/** 从 TextToSearchLogQuery 响应文本中提取 Content: 之后的正文 JSON */
function extractContentJson(result: Awaited<ReturnType<Client['callTool']>>): any {
  const { text } = (result.content as { text: string }[])[0];
  const idx = text.indexOf('Content: ');
  expect(idx).toBeGreaterThan(-1);
  return JSON.parse(text.slice(idx + 'Content: '.length));
}

describe('TextToSearchLogQuery', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  const baseArgs = {
    Text: '查询 ERROR 级别日志',
    Region: 'ap-guangzhou',
    TopicId: 'topic-123',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockChatCompletions.mockResolvedValue({
      RequestId: 'req-1',
      Choices: [{ Message: { Content: 'level:error', Role: 'assistant' }, FinishReason: 'stop' }],
    });
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    await serverTransport.close();
  });

  it('不传 Region，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'TextToSearchLogQuery',
      arguments: { Text: 'x', TopicId: 'topic-123' },
    });
    expect(result.isError).toBe(true);
  });

  it('必填参数正确透传给 ChatCompletions', async () => {
    await client.callTool({ name: 'TextToSearchLogQuery', arguments: baseArgs });
    expect(mockChatCompletions).toHaveBeenCalledOnce();
    const req = mockChatCompletions.mock.calls[0][0];
    expect(req.Model).toBe('text2sql');
    expect(req.Messages).toEqual([{ Content: baseArgs.Text, Role: 'user' }]);
    expect(req.Stream).toBe(false);
    const metadata: Record<string, string> = Object.fromEntries(
      (req.Metadata as { Key: string; Value: string }[]).map((m) => [m.Key, m.Value]),
    );
    expect(metadata.topic_id).toBe('topic-123');
    expect(metadata.topic_region).toBe('ap-guangzhou');
  });

  it('传入 SessionId 时透传给 Metadata，响应原样返回该 SessionId', async () => {
    const result = await client.callTool({
      name: 'TextToSearchLogQuery',
      arguments: { ...baseArgs, SessionId: 'client-session-abc' },
    });
    const metadata: Record<string, string> = Object.fromEntries(
      (mockChatCompletions.mock.calls[0][0].Metadata as { Key: string; Value: string }[]).map((m) => [m.Key, m.Value]),
    );
    expect(metadata.session_id).toBe('client-session-abc');
    expect(extractSessionId(result)).toBe('client-session-abc');
  });

  it('未传 SessionId 时自动生成 UUID，传入 Metadata 并在响应首行返回', async () => {
    const result = await client.callTool({ name: 'TextToSearchLogQuery', arguments: baseArgs });
    const metadata: Record<string, string> = Object.fromEntries(
      (mockChatCompletions.mock.calls[0][0].Metadata as { Key: string; Value: string }[]).map((m) => [m.Key, m.Value]),
    );
    const returnedSessionId = extractSessionId(result);
    // Metadata 与响应中返回的是同一个自动生成的 SessionId
    expect(metadata.session_id).toBe(returnedSessionId);
    // UUID v4 格式校验
    expect(returnedSessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('响应 content 为单个 text 项，SessionId 与 Content 标签行后跟原始结果', async () => {
    const result = await client.callTool({
      name: 'TextToSearchLogQuery',
      arguments: { ...baseArgs, SessionId: 'sess-1' },
    });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const { text } = (result.content as { text: string }[])[0];
    expect(text.split('\n')[0]).toBe('SessionId: sess-1');
    expect(text).toContain('\nContent: ');
    // Content 标签之后是原始 ChatCompletions 响应 JSON
    const data = extractContentJson(result);
    expect(data.RequestId).toBe('req-1');
    expect(data.Choices[0].Message.Content).toBe('level:error');
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockChatCompletions.mockRejectedValue(new Error('InternalError'));
    const result = await client.callTool({
      name: 'TextToSearchLogQuery',
      arguments: { ...baseArgs, SessionId: 'sess-1' },
    });
    expect(result.isError).toBe(true);
  });
});

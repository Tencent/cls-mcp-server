import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const mockDescribeIndex = vi.fn();
const mockDescribeLogHistogram = vi.fn();

let createMcpServer: typeof import('../index.js')['createMcpServer'];

beforeAll(async () => {
  vi.doMock('tencentcloud-sdk-nodejs-cls', () => {
    const MockClient = function () {
      return {
        DescribeIndex: mockDescribeIndex,
        DescribeLogHistogram: mockDescribeLogHistogram,
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

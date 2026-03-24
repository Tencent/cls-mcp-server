import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const mockQueryMetric = vi.fn();
const mockQueryRangeMetric = vi.fn();
const mockDescribeTopics = vi.fn();

let createMcpServer: typeof import('../index.js')['createMcpServer'];

beforeAll(async () => {
  vi.doMock('tencentcloud-sdk-nodejs-cls', () => {
    const MockClient = function () {
      return {
        QueryMetric: mockQueryMetric,
        QueryRangeMetric: mockQueryRangeMetric,
        DescribeTopics: mockDescribeTopics,
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

describe('QueryMetric', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await serverTransport.close();
  });

  it('不传 Region，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'QueryMetric',
      arguments: { TopicId: 'topic-123', Query: 'up' },
    });
    expect(result.isError).toBe(true);
  });

  it('不传 Time，SDK 入参不含 Time 字段', async () => {
    mockQueryMetric.mockResolvedValue({ ResultType: 'vector', Result: '[]', RequestId: 'req-1' });
    await client.callTool({
      name: 'QueryMetric',
      arguments: { Region: 'ap-guangzhou', TopicId: 'topic-123', Query: 'up' },
    });
    expect(mockQueryMetric).toHaveBeenCalledOnce();
    const params = mockQueryMetric.mock.calls[0][0];
    expect(params).not.toHaveProperty('Time');
    expect(params.TopicId).toBe('topic-123');
    expect(params.Query).toBe('up');
  });

  it('传入 Time，透传给 SDK', async () => {
    mockQueryMetric.mockResolvedValue({ ResultType: 'scalar', Result: '1', RequestId: 'req-2' });
    await client.callTool({
      name: 'QueryMetric',
      arguments: { Region: 'ap-guangzhou', TopicId: 'topic-123', Query: 'up', Time: 1704038400 },
    });
    expect(mockQueryMetric).toHaveBeenCalledOnce();
    expect(mockQueryMetric.mock.calls[0][0].Time).toBe(1704038400);
  });

  it('SDK 调用成功，返回 ResultType', async () => {
    mockQueryMetric.mockResolvedValue({
      ResultType: 'vector',
      Result: '[{"metric":{},"value":[1704038400,"1"]}]',
      RequestId: 'req-3',
    });
    const result = await client.callTool({
      name: 'QueryMetric',
      arguments: { Region: 'ap-guangzhou', TopicId: 'topic-123', Query: 'up' },
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result).ResultType).toBe('vector');
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockQueryMetric.mockRejectedValue(new Error('AuthFailure'));
    const result = await client.callTool({
      name: 'QueryMetric',
      arguments: { Region: 'ap-guangzhou', TopicId: 'topic-123', Query: 'up' },
    });
    expect(result.isError).toBe(true);
  });

  it('未设置 TENCENTCLOUD_API_BASE_HOST，使用默认域名', async () => {
    vi.stubEnv('TENCENTCLOUD_API_BASE_HOST', '');
    mockQueryMetric.mockResolvedValue({ ResultType: 'scalar', Result: '1', RequestId: 'r' });
    const result = await client.callTool({
      name: 'QueryMetric',
      arguments: { Region: 'ap-guangzhou', TopicId: 'topic-123', Query: 'up' },
    });
    expect(result.isError).toBeFalsy();
    expect(mockQueryMetric).toHaveBeenCalledOnce();
  });
});

describe('QueryRangeMetric', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await serverTransport.close();
  });

  it('不传 Region，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'QueryRangeMetric',
      arguments: { TopicId: 'topic-123', Query: 'up', Start: 1704038400, End: 1704039000, Step: 60 },
    });
    expect(result.isError).toBe(true);
  });

  it('Start/End/Step 正确透传给 SDK', async () => {
    mockQueryRangeMetric.mockResolvedValue({ ResultType: 'matrix', Result: '[]', RequestId: 'req-4' });
    await client.callTool({
      name: 'QueryRangeMetric',
      arguments: {
        Region: 'ap-guangzhou',
        TopicId: 'topic-123',
        Query: 'up',
        Start: 1704038400,
        End: 1704039000,
        Step: 60,
      },
    });
    expect(mockQueryRangeMetric).toHaveBeenCalledOnce();
    const params = mockQueryRangeMetric.mock.calls[0][0];
    expect(params.Start).toBe(1704038400);
    expect(params.End).toBe(1704039000);
    expect(params.Step).toBe(60);
  });

  it('SDK 调用成功，返回 ResultType', async () => {
    mockQueryRangeMetric.mockResolvedValue({
      ResultType: 'matrix',
      Result: '[{"metric":{},"values":[[1704038400,"1"],[1704038460,"2"]]}]',
      RequestId: 'req-5',
    });
    const result = await client.callTool({
      name: 'QueryRangeMetric',
      arguments: {
        Region: 'ap-guangzhou',
        TopicId: 'topic-123',
        Query: 'up',
        Start: 1704038400,
        End: 1704039000,
        Step: 60,
      },
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result).ResultType).toBe('matrix');
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockQueryRangeMetric.mockRejectedValue(new Error('InvalidParam'));
    const result = await client.callTool({
      name: 'QueryRangeMetric',
      arguments: {
        Region: 'ap-guangzhou',
        TopicId: 'topic-123',
        Query: 'up',
        Start: 1704038400,
        End: 1704039000,
        Step: 60,
      },
    });
    expect(result.isError).toBe(true);
  });

  it('未设置 TENCENTCLOUD_API_BASE_HOST，使用默认域名', async () => {
    vi.stubEnv('TENCENTCLOUD_API_BASE_HOST', '');
    mockQueryRangeMetric.mockResolvedValue({ ResultType: 'matrix', Result: '[]', RequestId: 'r' });
    const result = await client.callTool({
      name: 'QueryRangeMetric',
      arguments: {
        Region: 'ap-guangzhou',
        TopicId: 'topic-123',
        Query: 'up',
        Start: 1704038400,
        End: 1704039000,
        Step: 60,
      },
    });
    expect(result.isError).toBeFalsy();
    expect(mockQueryRangeMetric).toHaveBeenCalledOnce();
  });
});

describe('GetTopicInfoByName', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDescribeTopics.mockResolvedValue({
      Topics: [{ TopicName: 'test-topic', TopicId: 'topic-123', Period: 30 }],
      TotalCount: 1,
      RequestId: 'req-6',
    });
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    await serverTransport.close();
  });

  it('不传 Region，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'GetTopicInfoByName',
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });

  it('不传 searchText，Filters 为空数组', async () => {
    await client.callTool({
      name: 'GetTopicInfoByName',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(mockDescribeTopics.mock.calls[0][0].Filters).toEqual([]);
  });

  it('传入 searchText，Filters 包含 topicName 条件', async () => {
    await client.callTool({
      name: 'GetTopicInfoByName',
      arguments: { Region: 'ap-guangzhou', searchText: 'my-topic' },
    });
    const params = mockDescribeTopics.mock.calls[0][0];
    expect(params.Filters).toEqual([{ Key: 'topicName', Values: ['my-topic'] }]);
  });

  it('preciseSearch 默认为 false，PreciseSearch 透传为 0', async () => {
    await client.callTool({
      name: 'GetTopicInfoByName',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(mockDescribeTopics.mock.calls[0][0].PreciseSearch).toBe(0);
  });

  it('preciseSearch=true，PreciseSearch 透传为 1', async () => {
    await client.callTool({
      name: 'GetTopicInfoByName',
      arguments: { Region: 'ap-guangzhou', preciseSearch: true },
    });
    expect(mockDescribeTopics.mock.calls[0][0].PreciseSearch).toBe(1);
  });

  it('bizType 默认为 0，BizType 透传为 0', async () => {
    await client.callTool({
      name: 'GetTopicInfoByName',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(mockDescribeTopics.mock.calls[0][0].BizType).toBe(0);
  });

  it('bizType=1，BizType 透传为 1', async () => {
    await client.callTool({
      name: 'GetTopicInfoByName',
      arguments: { Region: 'ap-guangzhou', bizType: 1 },
    });
    expect(mockDescribeTopics.mock.calls[0][0].BizType).toBe(1);
  });

  it('SDK 调用成功，返回 Topics 列表', async () => {
    const result = await client.callTool({
      name: 'GetTopicInfoByName',
      arguments: { Region: 'ap-guangzhou', bizType: 1 },
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result).Topics[0].TopicId).toBe('topic-123');
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockDescribeTopics.mockRejectedValue(new Error('Forbidden'));
    const result = await client.callTool({
      name: 'GetTopicInfoByName',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBe(true);
  });
});

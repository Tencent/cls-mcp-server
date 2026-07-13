import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const mockQueryMetric = vi.fn();
const mockQueryRangeMetric = vi.fn();
const mockDescribeTopics = vi.fn();
const mockDescribeLogsets = vi.fn();

let createMcpServer: typeof import('../index.js')['createMcpServer'];

beforeAll(async () => {
  vi.doMock('tencentcloud-sdk-nodejs-cls', () => {
    const MockClient = function () {
      return {
        QueryMetric: mockQueryMetric,
        QueryRangeMetric: mockQueryRangeMetric,
        DescribeTopics: mockDescribeTopics,
        DescribeLogsets: mockDescribeLogsets,
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

describe('DescribeTopics', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDescribeTopics.mockResolvedValue({
      Topics: [
        {
          TopicName: 'test-topic',
          TopicId: 'topic-123',
          LogsetId: 'logset-456',
          LogsetInfo: { LogsetName: 'test-logset' },
          Period: 30,
          StorageType: 'hot',
          CreateTime: '2024-01-01 00:00:00',
          Index: true,
        },
      ],
      TotalCount: 1,
      RequestId: 'req-6',
    });
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await serverTransport.close();
  });

  it('不传 Region，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'DescribeTopics',
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });

  it('不传任何过滤条件，Filters 为空数组', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(mockDescribeTopics.mock.calls[0][0].Filters).toEqual([]);
  });

  it('传入 TopicName，Filters 包含 topicName 条件', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou', TopicName: 'my-topic' },
    });
    const params = mockDescribeTopics.mock.calls[0][0];
    expect(params.Filters).toEqual([{ Key: 'topicName', Values: ['my-topic'] }]);
  });

  it('传入 LogsetName，Filters 包含 logsetName 条件', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou', LogsetName: 'my-logset' },
    });
    const params = mockDescribeTopics.mock.calls[0][0];
    expect(params.Filters).toEqual([{ Key: 'logsetName', Values: ['my-logset'] }]);
  });

  it('传入 TopicId，Filters 包含 topicId 条件', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou', TopicId: 'topic-xyz' },
    });
    const params = mockDescribeTopics.mock.calls[0][0];
    expect(params.Filters).toEqual([{ Key: 'topicId', Values: ['topic-xyz'] }]);
  });

  it('传入 LogsetId，Filters 包含 logsetId 条件', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou', LogsetId: 'logset-xyz' },
    });
    const params = mockDescribeTopics.mock.calls[0][0];
    expect(params.Filters).toEqual([{ Key: 'logsetId', Values: ['logset-xyz'] }]);
  });

  it('传入多个过滤条件，Filters 包含全部条件', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou', TopicName: 'my-topic', LogsetId: 'logset-xy' },
    });
    const params = mockDescribeTopics.mock.calls[0][0];
    expect(params.Filters).toEqual([
      { Key: 'topicName', Values: ['my-topic'] },
      { Key: 'logsetId', Values: ['logset-xy'] },
    ]);
  });

  it('PreciseSearch 默认为 0', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(mockDescribeTopics.mock.calls[0][0].PreciseSearch).toBe(0);
  });

  it('PreciseSearch=3 精确匹配', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou', PreciseSearch: 3 },
    });
    expect(mockDescribeTopics.mock.calls[0][0].PreciseSearch).toBe(3);
  });

  it('BizType 默认为 0', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(mockDescribeTopics.mock.calls[0][0].BizType).toBe(0);
  });

  it('BizType=1 查询指标主题', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou', BizType: 1 },
    });
    expect(mockDescribeTopics.mock.calls[0][0].BizType).toBe(1);
  });

  it('Offset/Limit 透传给 SDK', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou', Offset: 10, Limit: 50 },
    });
    const params = mockDescribeTopics.mock.calls[0][0];
    expect(params.Offset).toBe(10);
    expect(params.Limit).toBe(50);
  });

  it('Offset/Limit 使用默认值', async () => {
    await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou' },
    });
    const params = mockDescribeTopics.mock.calls[0][0];
    expect(params.Offset).toBe(0);
    expect(params.Limit).toBe(20);
  });

  it('SDK 调用成功，返回精简 Topics 列表，包含 LogsetId 和 LogsetName', async () => {
    const result = await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result);
    expect(parsed.Topics[0].TopicId).toBe('topic-123');
    expect(parsed.Topics[0].LogsetId).toBe('logset-456');
    expect(parsed.Topics[0].LogsetName).toBe('test-logset');
    expect(parsed.TotalCount).toBe(1);
    expect(parsed.RequestId).toBe('req-6');
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockDescribeTopics.mockRejectedValue(new Error('Forbidden'));
    const result = await client.callTool({
      name: 'DescribeTopics',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBe(true);
  });
});

describe('DescribeLogsets', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDescribeLogsets.mockResolvedValue({
      Logsets: [
        {
          LogsetId: 'logset-123',
          LogsetName: 'test-logset',
          CreateTime: '2024-01-01 00:00:00',
          TopicCount: 3,
          MetricTopicCount: 1,
        },
      ],
      TotalCount: 1,
      RequestId: 'req-7',
    });
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await serverTransport.close();
  });

  it('不传 Region，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'DescribeLogsets',
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });

  it('不传 Filters，Filters 为空数组', async () => {
    await client.callTool({
      name: 'DescribeLogsets',
      arguments: { Region: 'ap-guangzhou' },
    });
    const params = mockDescribeLogsets.mock.calls[0][0];
    expect(params.Filters).toEqual([]);
  });

  it('传入 LogsetName，构建 logsetName 过滤条件', async () => {
    await client.callTool({
      name: 'DescribeLogsets',
      arguments: { Region: 'ap-guangzhou', LogsetName: 'my-logset' },
    });
    const params = mockDescribeLogsets.mock.calls[0][0];
    expect(params.Filters).toEqual([{ Key: 'logsetName', Values: ['my-logset'] }]);
  });

  it('传入 LogsetId，构建 logsetId 过滤条件', async () => {
    await client.callTool({
      name: 'DescribeLogsets',
      arguments: { Region: 'ap-guangzhou', LogsetId: 'logset-123' },
    });
    const params = mockDescribeLogsets.mock.calls[0][0];
    expect(params.Filters).toEqual([{ Key: 'logsetId', Values: ['logset-123'] }]);
  });

  it('Offset/Limit 透传给 SDK', async () => {
    await client.callTool({
      name: 'DescribeLogsets',
      arguments: { Region: 'ap-guangzhou', Offset: 5, Limit: 10 },
    });
    const params = mockDescribeLogsets.mock.calls[0][0];
    expect(params.Offset).toBe(5);
    expect(params.Limit).toBe(10);
  });

  it('Offset/Limit 使用默认值', async () => {
    await client.callTool({
      name: 'DescribeLogsets',
      arguments: { Region: 'ap-guangzhou' },
    });
    const params = mockDescribeLogsets.mock.calls[0][0];
    expect(params.Offset).toBe(0);
    expect(params.Limit).toBe(20);
  });

  it('SDK 调用成功，返回 Logsets 列表，包含 Region 字段', async () => {
    const result = await client.callTool({
      name: 'DescribeLogsets',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result);
    expect(parsed.Logsets[0].LogsetId).toBe('logset-123');
    expect(parsed.Logsets[0].LogsetName).toBe('test-logset');
    expect(parsed.Logsets[0].Region).toBe('ap-guangzhou');
    expect(parsed.Logsets[0].CreateTime).toBe('2024-01-01 00:00:00');
    expect(parsed.TotalCount).toBe(1);
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockDescribeLogsets.mockRejectedValue(new Error('Forbidden'));
    const result = await client.callTool({
      name: 'DescribeLogsets',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBe(true);
  });
});

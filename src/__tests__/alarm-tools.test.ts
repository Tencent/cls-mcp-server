import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const mockDescribeAlarms = vi.fn();
const mockDescribeAlertRecordHistory = vi.fn();
const mockGetAlarmLog = vi.fn();
const mockDescribeAlarmNotices = vi.fn();
const mockDescribeAlarmShields = vi.fn();
const mockDescribeNoticeContents = vi.fn();
const mockDescribeWebCallbacks = vi.fn();
const mockRequest = vi.fn();

let createMcpServer: typeof import('../index.js')['createMcpServer'];

beforeAll(async () => {
  vi.doMock('tencentcloud-sdk-nodejs-cls', () => {
    const MockClient = function () {
      return {
        DescribeAlarms: mockDescribeAlarms,
        DescribeAlertRecordHistory: mockDescribeAlertRecordHistory,
        GetAlarmLog: mockGetAlarmLog,
        DescribeAlarmNotices: mockDescribeAlarmNotices,
        DescribeAlarmShields: mockDescribeAlarmShields,
        DescribeNoticeContents: mockDescribeNoticeContents,
        DescribeWebCallbacks: mockDescribeWebCallbacks,
        SearchLog: vi.fn(),
        DescribeLogContext: vi.fn(),
        DescribeTopics: vi.fn(),
        QueryMetric: vi.fn(),
        QueryRangeMetric: vi.fn(),
        DescribeIndex: vi.fn(),
        DescribeLogHistogram: vi.fn(),
        request: mockRequest,
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

// ==================== DescribeAlarms ====================

describe('DescribeAlarms', () => {
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
      name: 'DescribeAlarms',
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });

  it('SDK 调用成功，返回告警列表', async () => {
    mockDescribeAlarms.mockResolvedValue({
      Alarms: [{ AlarmId: 'alarm-123', Name: 'test-alarm' }],
      TotalCount: 1,
      RequestId: 'req-1',
    });
    const result = await client.callTool({
      name: 'DescribeAlarms',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result).Alarms[0].AlarmId).toBe('alarm-123');
  });

  it('Filters 正确透传给 SDK', async () => {
    mockDescribeAlarms.mockResolvedValue({ Alarms: [], TotalCount: 0, RequestId: 'req-2' });
    await client.callTool({
      name: 'DescribeAlarms',
      arguments: { Region: 'ap-guangzhou', Filters: [{ Key: 'enable', Values: ['1'] }] },
    });
    expect(mockDescribeAlarms).toHaveBeenCalledOnce();
    expect(mockDescribeAlarms.mock.calls[0][0].Filters).toEqual([{ Key: 'enable', Values: ['1'] }]);
  });
});

// ==================== DescribeAlertRecordHistory ====================

describe('DescribeAlertRecordHistory', () => {
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
      name: 'DescribeAlertRecordHistory',
      arguments: { From: 1704038400000, To: 1704042000000 },
    });
    expect(result.isError).toBe(true);
  });

  it('From/To 正确透传给 SDK', async () => {
    mockDescribeAlertRecordHistory.mockResolvedValue({ Records: [], TotalCount: 0, RequestId: 'req-3' });
    await client.callTool({
      name: 'DescribeAlertRecordHistory',
      arguments: { Region: 'ap-guangzhou', From: 1704038400000, To: 1704042000000 },
    });
    expect(mockDescribeAlertRecordHistory).toHaveBeenCalledOnce();
    const params = mockDescribeAlertRecordHistory.mock.calls[0][0];
    expect(params.From).toBe(1704038400000);
    expect(params.To).toBe(1704042000000);
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockDescribeAlertRecordHistory.mockRejectedValue(new Error('AuthFailure'));
    const result = await client.callTool({
      name: 'DescribeAlertRecordHistory',
      arguments: { Region: 'ap-guangzhou', From: 1704038400000, To: 1704042000000 },
    });
    expect(result.isError).toBe(true);
  });
});

// ==================== GetAlarmLog ====================

describe('GetAlarmLog', () => {
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
      name: 'GetAlarmLog',
      arguments: { From: 1704038400000, To: 1704042000000, Query: '*' },
    });
    expect(result.isError).toBe(true);
  });

  it('Query/From/To 正确透传给 SDK', async () => {
    mockGetAlarmLog.mockResolvedValue({ Results: [], ListOver: true, RequestId: 'req-4' });
    await client.callTool({
      name: 'GetAlarmLog',
      arguments: { Region: 'ap-guangzhou', From: 1704038400000, To: 1704042000000, Query: '*' },
    });
    expect(mockGetAlarmLog).toHaveBeenCalledOnce();
    const params = mockGetAlarmLog.mock.calls[0][0];
    expect(params.Query).toBe('*');
    expect(params.From).toBe(1704038400000);
    expect(params.To).toBe(1704042000000);
  });

  it('Context 参数正确透传', async () => {
    mockGetAlarmLog.mockResolvedValue({ Results: [], ListOver: true, RequestId: 'req-5' });
    await client.callTool({
      name: 'GetAlarmLog',
      arguments: {
        Region: 'ap-guangzhou',
        From: 1704038400000,
        To: 1704042000000,
        Query: '*',
        Context: 'ctx-abc',
      },
    });
    expect(mockGetAlarmLog.mock.calls[0][0].Context).toBe('ctx-abc');
  });
});

// ==================== DescribeAlarmNotices ====================

describe('DescribeAlarmNotices', () => {
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
      name: 'DescribeAlarmNotices',
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });

  it('SDK 调用成功，返回通知渠道组列表', async () => {
    mockDescribeAlarmNotices.mockResolvedValue({
      AlarmNotices: [{ AlarmNoticeId: 'notice-123', Name: 'test-notice' }],
      TotalCount: 1,
      RequestId: 'req-6',
    });
    const result = await client.callTool({
      name: 'DescribeAlarmNotices',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result).AlarmNotices[0].AlarmNoticeId).toBe('notice-123');
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockDescribeAlarmNotices.mockRejectedValue(new Error('Forbidden'));
    const result = await client.callTool({
      name: 'DescribeAlarmNotices',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBe(true);
  });
});

// ==================== DescribeAlarmShields ====================

describe('DescribeAlarmShields', () => {
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
      name: 'DescribeAlarmShields',
      arguments: { AlarmNoticeId: 'notice-123' },
    });
    expect(result.isError).toBe(true);
  });

  it('AlarmNoticeId 正确透传给 SDK', async () => {
    mockDescribeAlarmShields.mockResolvedValue({ AlarmShields: [], TotalCount: 0, RequestId: 'req-7' });
    await client.callTool({
      name: 'DescribeAlarmShields',
      arguments: { Region: 'ap-guangzhou', AlarmNoticeId: 'notice-456' },
    });
    expect(mockDescribeAlarmShields).toHaveBeenCalledOnce();
    expect(mockDescribeAlarmShields.mock.calls[0][0].AlarmNoticeId).toBe('notice-456');
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockDescribeAlarmShields.mockRejectedValue(new Error('NotFound'));
    const result = await client.callTool({
      name: 'DescribeAlarmShields',
      arguments: { Region: 'ap-guangzhou', AlarmNoticeId: 'notice-123' },
    });
    expect(result.isError).toBe(true);
  });
});

// ==================== DescribeNoticeContents ====================

describe('DescribeNoticeContents', () => {
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
      name: 'DescribeNoticeContents',
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });

  it('SDK 调用成功，返回通知内容模板列表', async () => {
    mockDescribeNoticeContents.mockResolvedValue({
      NoticeContents: [{ NoticeContentId: 'content-123', Name: 'test-template' }],
      TotalCount: 1,
      RequestId: 'req-8',
    });
    const result = await client.callTool({
      name: 'DescribeNoticeContents',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result).NoticeContents[0].NoticeContentId).toBe('content-123');
  });

  it('Filters 正确透传给 SDK', async () => {
    mockDescribeNoticeContents.mockResolvedValue({ NoticeContents: [], TotalCount: 0, RequestId: 'req-9' });
    await client.callTool({
      name: 'DescribeNoticeContents',
      arguments: { Region: 'ap-guangzhou', Filters: [{ Key: 'name', Values: ['my-template'] }] },
    });
    expect(mockDescribeNoticeContents.mock.calls[0][0].Filters).toEqual([{ Key: 'name', Values: ['my-template'] }]);
  });
});

// ==================== DescribeWebCallbacks ====================

describe('DescribeWebCallbacks', () => {
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
      name: 'DescribeWebCallbacks',
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });

  it('SDK 调用成功，返回回调配置列表', async () => {
    mockDescribeWebCallbacks.mockResolvedValue({
      WebCallbacks: [{ CallbackId: 'cb-123', Name: 'test-webhook', Url: 'https://example.com/hook' }],
      TotalCount: 1,
      RequestId: 'req-10',
    });
    const result = await client.callTool({
      name: 'DescribeWebCallbacks',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result).WebCallbacks[0].CallbackId).toBe('cb-123');
  });

  it('SDK 抛出异常，返回 isError=true', async () => {
    mockDescribeWebCallbacks.mockRejectedValue(new Error('InternalError'));
    const result = await client.callTool({
      name: 'DescribeWebCallbacks',
      arguments: { Region: 'ap-guangzhou' },
    });
    expect(result.isError).toBe(true);
  });
});

// ==================== GetAlarmDetail ====================

const mockFetch = vi.fn();

describe('GetAlarmDetail', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    ({ client, serverTransport } = await createTestClient());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await serverTransport.close();
  });

  it('空 URL，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: '' },
    });
    expect(result.isError).toBe(true);
  });

  it('不允许的 URL 域名，返回 isError=true', async () => {
    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: 'https://evil.com/attack' },
    });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toContain('不允许的告警地址');
  });

  it('短链重定向 + API 调用成功，返回 Markdown 告警详情', async () => {
    // fetch：短链 302 重定向
    mockFetch.mockResolvedValueOnce({
      status: 302,
      headers: new Map([
        [
          'location',
          'https://ap-guangzhou-open-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=test-record-123',
        ],
      ]),
    });
    // clsClient.request('DescribeAlarmDetail', ...) 返回告警详情
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: '测试告警',
        AlertId: 'alarm-test-001',
        TopicId: 'topic-abc',
        Region: 'ap-guangzhou',
        StartTime: '2024-01-01 10:00:00',
        Duration: 5,
        Trigger: 'count > 100',
        TriggerParams: '120',
        Query: 'level:ERROR',
      }),
    });

    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: 'https://alarm.cls.tencentcs.com/WeNZ5sSP' },
    });
    expect(result.isError).toBeFalsy();
    const { text } = (result.content as { text: string }[])[0];
    expect(text).toContain('测试告警');
    expect(text).toContain('alarm-test-001');
    expect(text).toContain('ap-guangzhou');
  });

  it('长链直接解析（无重定向），返回告警详情', async () => {
    const longUrl =
      'https://ap-beijing-open-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=record-456';
    // 长链已包含 RecordId，resolveRedirectUrl 跳过 fetch，无需 mockFetch
    // clsClient.request('DescribeAlarmDetail', ...) 返回告警详情
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: '北京告警',
        AlertId: 'alarm-bj-001',
        TopicId: 'topic-bj',
        Region: 'ap-beijing',
      }),
    });

    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: longUrl },
    });
    expect(result.isError).toBeFalsy();
    const { text } = (result.content as { text: string }[])[0];
    expect(text).toContain('北京告警');
    expect(text).toContain('ap-beijing');
  });

  it('API 返回空详情，返回 isError=true', async () => {
    // 短链重定向
    mockFetch.mockResolvedValueOnce({
      status: 302,
      headers: new Map([
        [
          'location',
          'https://ap-guangzhou-open-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=empty-record',
        ],
      ]),
    });
    // clsClient.request('DescribeAlarmDetail', ...) 返回空 RecordLog
    mockRequest.mockResolvedValueOnce({
      RecordLog: '',
    });

    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: 'https://alarm.cls.tencentcs.com/expired' },
    });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toContain('告警详情为空');
  }, 120000);
});

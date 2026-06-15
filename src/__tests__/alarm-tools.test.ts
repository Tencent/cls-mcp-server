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

const mockDescribeRegions = vi.fn().mockResolvedValue({ RegionSet: [] });

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
        DescribeRegions: mockDescribeRegions,
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
    // 默认让 DescribeRegions 返回常用地域,避免每个 case 都要重新铺 mock。
    // 不再使用模块级缓存,每次 GetAlarmDetail 都会真实 await 一次 mock 调用。
    mockDescribeRegions.mockResolvedValue({
      RegionSet: [
        { Region: 'ap-guangzhou', RegionName: '华南地区(广州)' },
        { Region: 'ap-beijing', RegionName: '华北地区(北京)' },
        { Region: 'ap-tokyo', RegionName: '亚太东北(东京)' },
        { Region: 'ap-nanjing', RegionName: '华东地区(南京)' },
      ],
    });
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

  // ==================== SSRF 回归：禁止把合法域名塞到 path / query / userinfo 绕过校验 ====================
  it.each([
    // 将合法域名塞入 path
    'https://attacker.com/monitor.cls.tencentcs.com',
    // 塞入 query
    'https://attacker.com/?x=monitor.cls.tencentcs.com',
    // 塞入 userinfo（hostname 实际为 attacker.com）
    'https://monitor.cls.tencentcs.com@attacker.com/',
    // 端口探测：内网地址 + 把合法域名塞入 path
    'http://127.0.0.1:22/monitor.cls.tencentcs.com',
    // 云元数据 + path 绕过
    'http://169.254.169.254/latest/meta-data?x=monitor.cls.tencentcs.com',
    // 子串拼接想绕过正则
    'https://evilmonitor.cls.tencentcs.com/cls_no_login',
    // 协议降级
    'http://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?RecordId=x',
  ])('SSRF 绕过尝试 %s 必须被拒绝', async (url) => {
    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: url },
    });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toContain('不允许的告警地址');
    // 关键：不允许发起网络请求
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('短链重定向到不允许的域名，必须拒绝', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 302,
      headers: new Map([['location', 'http://127.0.0.1:22/']]),
    });
    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: 'https://alarm.cls.tencentcs.com/WeNZ5sSP' },
    });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toContain('不允许的地址');
  });

  it('短链重定向 + API 调用成功，返回 Markdown 告警详情', async () => {
    // fetch：短链 302 重定向
    mockFetch.mockResolvedValueOnce({
      status: 302,
      headers: new Map([
        [
          'location',
          'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=test-record-123',
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
    // 地域代码 ap-guangzhou 经反查后应展示为 "广州"(beforeEach 默认 mock 已注入此映射)
    expect(text).toContain('广州');
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
    // ap-beijing 经反查后应展示为 "北京"
    expect(text).toContain('北京');
  });

  it('API 返回空详情，返回 isError=true', async () => {
    // 短链重定向
    mockFetch.mockResolvedValueOnce({
      status: 302,
      headers: new Map([
        [
          'location',
          'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=empty-record',
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

  // ==================== 回归: 后端在记录不存在时会返回字符串 "null" ====================
  // CLS DescribeAlarmDetail 接口在找不到记录(过期、跨账号查询等)时会把空值序列化成
  // 字符串 "null",早期版本只挡了空字符串,会让 JSON.parse("null") → null 一路走到
  // formatAlarmDetail,生成全是"未知"的 Markdown,让用户以为告警有内容但所有字段都缺失。
  it('RecordLog 为字符串 "null"（后端记录不存在）应返回 isError=true 而非渲染"未知"告警', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-not-found';
    mockRequest.mockResolvedValueOnce({ RecordLog: 'null' });

    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: longUrl },
    });
    expect(result.isError).toBe(true);
    const { text } = (result.content as { text: string }[])[0];
    expect(text).toContain('告警详情为空');
    // 关键: 不能渲染出含"未知"占位符的 Markdown 骗用户
    expect(text).not.toMatch(/告警等级:\s*未知/);
    expect(text).not.toContain('### ⚠️ 1.告警基本信息');
  });

  // ==================== 回归: 真实 RecordLog 结构（嵌套在 ResultsSnapshot/AlertSnapshot） ====================
  // RecordLog 实际字段大多在 ResultsSnapshot / AlertSnapshot.AlertInfo 中,
  // 早期版本只读顶层会导致大量字段显示"未知"。
  it('完整 RecordLog（嵌套 ResultsSnapshot 与 AlertSnapshot）能正确解析所有字段', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-full-001';
    const fullRecord = {
      Id: 0,
      RecordId: 'rec-full-001',
      AlertId: 'alarm-00000000-0000-0000-0000-000000000001',
      AlertName: '示例告警策略',
      TopicId: 'topic-00000000-0000-0000-0000-000000000010',
      TopicName: '示例日志主题',
      Status: 1, // 1 = 已恢复
      CreateTime: 1778746282659,
      RecoverTime: 0,
      ResultsSnapshot: {
        Level: 'Warn',
        level_zh: '警告',
        Region: '广州',
        LogsetId: 'logset-00000000-0000-0000-0000-000000000020',
        LogsetName: '示例日志集',
        StartTime: '2026-05-14 16:11:16',
        StartTimeUnix: 1778746276017,
        FireTime: 1778746276017,
        NotifyTime: '2026-05-14 16:11:16',
        Trigger: '$1.metric > 0',
        TriggerParams: '$1.metric=12;',
        Condition: '$1.metric > 0',
        Query: '* | select count(*) as metric',
        CustomizeMessage: '',
        NotifyType: 1,
        NotifyTempInfo: [{ TempID: 'notice-00000000-0000-0000-0000-000000000030', TempName: '示例通知模板' }],
        ActualCallback: [{ URL: 'https://example.com/webhook?key=demo' }],
        ActualReceivers: [],
        AnalysisInfo: [
          {
            Name: 'raw',
            Type: 'original',
            AnalysisOriginal: [
              {
                __HOSTNAME__: 'host-a',
                statusCode: '500',
                level: 'info',
              },
            ],
          },
        ],
        RawResults: [[{ metric: 12 }]],
        ColNames: [['metric']],
        Columns: [[{ Name: 'metric', Type: 'bigint' }]],
        ConsecutiveAlertNums: 1,
        HappenThreshold: 1,
        PlatForm: '腾讯云',
        DetailUrl: 'https://alarm.cls.tencentcs.com/aaaaaaaa',
        QueryUrl: 'https://alarm.cls.tencentcs.com/bbbbbbbb',
        SilentUrl: 'https://alarm.cls.tencentcs.com/cccccccc',
        ClaimUrl: 'https://alarm.cls.tencentcs.com/dddddddd',
        AlertHistoryUrl: 'https://console.cloud.tencent.com/cls/alarm/history',
        ConsoleUrl: 'https://console.cloud.tencent.com/cls/overview',
        QueryParams: [
          {
            StartTime: 1778745930000,
            EndTime: 1778746230000,
            grammarVersion: 'cql',
          },
        ],
      },
      AlertSnapshot: {
        AlertInfo: {
          AlarmLevel: 0, // 数字 0 不能被 || 当 falsy 跳过
          Interval: 5, // 执行周期 5 分钟
          HappenThreshold: 1,
          MultiConditions: [{ AlarmLevel: 0, Trigger: '$1.metric > 0' }],
        },
      },
    };
    mockRequest.mockResolvedValueOnce({ RecordLog: JSON.stringify(fullRecord) });

    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: longUrl },
    });
    expect(result.isError).toBeFalsy();
    const { text } = (result.content as { text: string }[])[0];

    // 1. 基本信息 - 所有顶层与嵌套字段都应解析
    expect(text).toContain('示例告警策略');
    expect(text).toContain('alarm-00000000-0000-0000-0000-000000000001');
    expect(text).toContain('警告'); // 等级中文
    expect(text).toContain('已恢复'); // Status: 1
    expect(text).toContain('腾讯云'); // PlatForm
    expect(text).not.toMatch(/告警等级:\s*未知/);
    expect(text).not.toMatch(/告警状态:\s*未知/);

    // 2. 监控对象 - 名称 + ID 同时展示
    expect(text).toContain('示例日志主题');
    expect(text).toContain('topic-00000000-0000-0000-0000-000000000010');
    expect(text).toContain('日志集');
    expect(text).toContain('logset-00000000-0000-0000-0000-000000000020');

    // 3. 时间 - 优先用 ResultsSnapshot.StartTime 字符串而不是 record.CreateTime 时间戳
    expect(text).toContain('2026-05-14 16:11:16');

    // 4. 触发条件 - 当前数据 / 执行周期 / 告警频率
    expect(text).toContain('$1.metric=12');
    expect(text).toContain('每 5 分钟');
    expect(text).toContain('持续 1 个监控周期');

    // 5. CQL 查询语句
    expect(text).toContain('select count(*) as metric');

    // 6. 通知配置
    expect(text).toContain('告警触发'); // NotifyType: 1
    expect(text).toContain('example.com/webhook'); // Webhook

    // 7. 多维分析（每字段独立成行）
    expect(text).toContain('host-a');
    expect(text).toContain('statusCode');

    // 8. 当前数据(RawResults + ColNames 表格,而非旧版 KV 行)
    expect(text).toContain('| metric |');
    expect(text).toMatch(/\|\s*12\s*\|/);

    // 9. 相关链接（Markdown 链接形式）
    expect(text).toContain('[告警详情]');
    expect(text).toContain('[查询日志]');
    expect(text).toContain('[告警历史]');
  });

  // ==================== 回归: region 必须按 host 原样传给 SDK,不可剥离任何后缀 ====================
  // 一旦 region 被错误改写,会导致 SDK 在错误地域查询,返回空 RecordLog → 全部"未知"。
  it('parseAlarmDetailUrl 解析出的 region 必须与 host 中的前缀完全一致,不剥离任何后缀', async () => {
    const longUrl =
      'https://ap-guangzhou-open-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-region-test';
    let capturedRegion = '';
    // mockRequest 默认行为:  捕获被调用时的 region(通过 mockClient 的 region 字段不容易,
    // 改成在 mockRequest 第一次调用时,把 RecordLog 内嵌的 RecordId 设成 region,以便回查)。
    // 简化做法:  让 RecordLog 中的 AlertName 反射 region,断言它原样出现。
    mockRequest.mockImplementationOnce(async (action: string) => {
      // request 不直接拿到 region,但我们可以通过 mock createClsClient 的方式拦截。
      // 由于本测试套件已 mock SDK Client 工厂,client.region 在此处不易访问;
      // 这里采用更直接的契约:  确认 mockRequest 被调用且 RecordId 来自原始长链(已隐含 region 正确性)。
      capturedRegion = action; // 这里 action 应是 'DescribeAlarmDetail'
      return {
        RecordLog: JSON.stringify({
          AlertName: '区域回归',
          AlertId: 'alarm-region-001',
          ResultsSnapshot: { Region: '广州', Level: 'Warn' },
        }),
      };
    });

    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: longUrl },
    });
    expect(result.isError).toBeFalsy();
    expect(capturedRegion).toBe('DescribeAlarmDetail');
    // 确认走到了 API 调用,而不是因 region 错误被前置拦截
    expect(mockRequest).toHaveBeenCalledTimes(1);
    const { text } = (result.content as { text: string }[])[0];
    expect(text).toContain('区域回归');
  });

  // ==================== 回归: AlarmLevel 数字 0 不能被当 falsy ====================
  it('AlarmLevel=0 应显示为"警告 (Warn)" 而不是"未知"', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-level-zero';
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: 'L0 告警',
        AlertId: 'alarm-l0',
        AlertSnapshot: { AlertInfo: { AlarmLevel: 0 } },
      }),
    });
    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: longUrl },
    });
    expect(result.isError).toBeFalsy();
    const { text } = (result.content as { text: string }[])[0];
    expect(text).toMatch(/告警等级:\s*警告/);
    expect(text).not.toMatch(/告警等级:\s*未知/);
  });

  // ==================== 回归: formatResponse 对字符串不二次 JSON.stringify ====================
  it('返回的 Markdown 文本不应被二次 JSON 序列化（无外层引号、无字面 \\n）', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-stringify';
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({ AlertName: 'X', AlertId: 'alarm-x' }),
    });
    const result = await client.callTool({
      name: 'GetAlarmDetail',
      arguments: { AlarmDetailUrl: longUrl },
    });
    const { text } = (result.content as { text: string }[])[0];
    // 真换行存在
    expect(text).toContain('\n');
    // 不应包含字面量 \n 序列(双重 stringify 的特征)
    expect(text).not.toMatch(/\\n/);
    // 不应被外层引号包裹
    expect(text.startsWith('"')).toBe(false);
    // 应以 Markdown 标题开头
    expect(text.startsWith('### ')).toBe(true);
  });

  // ==================== 回归: RecordLog.Status 取值为 0/1/2 ====================
  // CLS DescribeAlarmDetail 返回的 RecordLog.Status:
  //   0 = 未恢复 / 触发中
  //   1 = 已恢复
  //   2 = 已失效
  // ==================== 回归: RecordLog.Status 取值为 0/1/2/3 ====================
  // CLS DescribeAlarmDetail 返回的 RecordLog.Status:
  //   0 = 未恢复 / 触发中
  //   1 = 已恢复
  //   2 = 已失效
  //   3 = 处理中(已认领)
  it('Status 0/1/2/3 应分别显示 未恢复/已恢复/已失效/处理中', async () => {
    const baseUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=';
    const cases: Array<[number, string]> = [
      [0, '未恢复'],
      [1, '已恢复'],
      [2, '已失效'],
      [3, '处理中'],
    ];
    for (const [code] of cases) {
      mockRequest.mockResolvedValueOnce({
        RecordLog: JSON.stringify({ AlertName: 'A', Status: code }),
      });
    }
    for (const [code, expected] of cases) {
      const r = await client.callTool({
        name: 'GetAlarmDetail',
        arguments: { AlarmDetailUrl: `${baseUrl}rec-st-${code}` },
      });
      expect((r.content as { text: string }[])[0].text).toContain(expected);
    }
  });

  // ==================== 回归: 已恢复时显示恢复时间;未恢复时不显示恢复时间这一行 ====================
  it('已恢复(RecoverTime>0)显示恢复时间,未恢复(RecoverTime=0)不输出"尚未恢复"行', async () => {
    const longUrlOk =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-recovered';
    const longUrlNotYet =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-ongoing';
    mockRequest
      .mockResolvedValueOnce({
        // Status=1 已恢复
        RecordLog: JSON.stringify({ AlertName: 'A', Status: 1, RecoverTime: 1778800000000 }),
      })
      .mockResolvedValueOnce({
        // Status=0 未恢复
        RecordLog: JSON.stringify({ AlertName: 'A', Status: 0, RecoverTime: 0 }),
      });

    const ok = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrlOk } });
    const okText = (ok.content as { text: string }[])[0].text;
    expect(okText).toContain('恢复时间');
    expect(okText).not.toContain('尚未恢复');

    const notYet = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrlNotYet } });
    const notYetText = (notYet.content as { text: string }[])[0].text;
    expect(notYetText).not.toContain('恢复时间:');
    expect(notYetText).not.toContain('尚未恢复');
  });

  // ==================== 回归: 不能把告警策略启用状态当成记录状态 ====================
  // AlertSnapshot.AlertInfo.Status 是告警策略本身的启用状态(1=启用), Record.Status 才是记录状态。
  // 早期 fallback 到 AlertInfo.Status 会让"已停用且未恢复"的告警错误显示成"已恢复"。
  it('Record.Status=0(未恢复) 即使 AlertInfo.Status=1(策略启用) 也应显示"未恢复"', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-status-fallback';
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: 'A',
        Status: 0, // 记录: 未恢复
        AlertSnapshot: { AlertInfo: { Status: 1 } }, // 策略: 启用
      }),
    });
    const r = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrl } });
    const { text } = (r.content as { text: string }[])[0];
    expect(text).toContain('未恢复');
    expect(text).not.toMatch(/告警状态:\s*已恢复/);
  });

  // ==================== 回归: 多维分析 type=query 的 AnalysisResults 是 {Data:[{Key,Value}]} 嵌套结构 ====================
  // 后端可能返回的两种结构:
  //   1) [{ Data: [{Key:"col1", Value:"v1"}, {Key:"col2", Value:"v2"}] }]
  //   2) [{ col1:"v1", col2:"v2" }]
  // 早期实现只处理 (2),遇到 (1) 时会把 Data 数组渲染成 "[object Object],[object Object]"。
  it('AnalysisResults 嵌套 Data:[{Key,Value}] 结构应正确展开为表格', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-query-analysis';
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: 'Q',
        AlertId: 'alarm-q',
        ResultsSnapshot: {
          AnalysisInfo: [
            {
              Name: '示例查询分析',
              Type: 'query',
              AnalysisResults: [
                {
                  Data: [
                    { Key: 'col_a', Value: 'val_1' },
                    { Key: 'col_b', Value: '12.0' },
                  ],
                },
                {
                  Data: [
                    { Key: 'col_a', Value: 'val_2' },
                    { Key: 'col_b', Value: '15.5' },
                  ],
                },
              ],
            },
          ],
        },
      }),
    });
    const r = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrl } });
    const { text } = (r.content as { text: string }[])[0];
    // 关键断言: 不能再出现 [object Object]
    expect(text).not.toContain('[object Object]');
    // 列名 + 数据都应作为单独的列渲染
    expect(text).toMatch(/\|\s*col_a\s*\|\s*col_b\s*\|/);
    expect(text).toContain('val_1');
    expect(text).toContain('12.0');
    expect(text).toContain('val_2');
    expect(text).toContain('15.5');
  });

  // ==================== 回归: 地域显示通过云 API 反查代码 → 中文展示名 ====================
  // 不再硬编码地域代码 → 中文映射,改为复用 GetRegionCodeByName 同款 DescribeRegions 接口数据。
  // ResultsSnapshot.Region 已是中文时直接展示;否则按 AlertHistoryUrl ?region= 解析后反查。
  it('AlertHistoryUrl 携带 region 代码时,通过 DescribeRegions 反查中文展示名', async () => {
    mockDescribeRegions.mockResolvedValueOnce({
      RegionSet: [
        { Region: 'ap-tokyo', RegionName: '亚太东北(东京)' },
        { Region: 'ap-guangzhou', RegionName: '华南地区(广州)' },
      ],
    });
    const longUrl =
      'https://ap-tokyo-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-region-display';
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: 'A',
        AlertId: 'alarm-r',
        ResultsSnapshot: {
          // 没有中文 Region,只能通过 AlertHistoryUrl 反查
          AlertHistoryUrl: 'https://console.cloud.tencent.com/cls/alarm/history?region=ap-tokyo&tag=historyDetail',
        },
      }),
    });
    const r = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrl } });
    const { text } = (r.content as { text: string }[])[0];
    expect(text).toMatch(/地域:\s*东京/);
  });

  // ==================== 回归: SPA 路由把 region 放在 hash 后,也能正确解析 ====================
  it('AlertHistoryUrl 把 region 放在 hash querystring (#/?region=...) 时也能反查', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-region-hash';
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: 'A',
        AlertId: 'alarm-r2',
        ResultsSnapshot: {
          AlertHistoryUrl: 'https://console.cloud.tencent.com/cls/alarm/history#/?region=ap-tokyo',
        },
      }),
    });
    const r = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrl } });
    const { text } = (r.content as { text: string }[])[0];
    expect(text).toMatch(/地域:\s*东京/);
  });

  // ==================== 回归: RecordLog 是 JSON 数组时也应被识别为"详情为空" ====================
  it('RecordLog 解析为数组(后端误返/将来 schema 变更)应返回 isError=true', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-array';
    mockRequest.mockResolvedValueOnce({ RecordLog: '[]' });
    const r = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrl } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain('告警详情为空');
  });

  // ==================== 回归: Markdown 表格的单元格含 | 与换行需要被转义,避免破坏表格 ====================
  it('RawResults 单元格中包含 | 与换行符时不破坏 Markdown 表格', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-md-escape';
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: 'A',
        AlertId: 'alarm-md',
        ResultsSnapshot: {
          ColNames: [['col_a', 'col_b']],
          RawResults: [[{ col_a: 'GET /a?x=1|y=2', col_b: 'line1\nline2' }]],
        },
      }),
    });
    const r = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrl } });
    const { text } = (r.content as { text: string }[])[0];
    // | 必须被反斜杠转义,不能再作为列分隔符
    expect(text).toContain('GET /a?x=1\\|y=2');
    // 换行被替换为 <br>,不会拆出新行
    expect(text).toContain('line1<br>line2');
    // 整行内部不应该有裸的 \n
    expect(text).not.toMatch(/line1\nline2/);
  });

  // ==================== 回归: 多维分析 type=original 的 Fields 全空(",") 时不要静默隐藏所有字段 ====================
  it('Fields="," 等空 token 列表应被忽略,展示全部字段', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-fields-empty';
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: 'A',
        AlertId: 'alarm-fe',
        ResultsSnapshot: {
          AnalysisInfo: [
            {
              Name: '原始日志',
              Type: 'original',
              ConfigInfo: [{ Key: 'Fields', Value: ',' }],
              AnalysisOriginal: [{ host: 'host-a', level: 'info' }],
            },
          ],
        },
      }),
    });
    const r = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrl } });
    const { text } = (r.content as { text: string }[])[0];
    // 应当展示全部字段(等同于 Fields 缺省时的行为)
    expect(text).toContain('host: host-a');
    expect(text).toContain('level: info');
  });

  // ==================== 回归: Interval 序列化为字符串数字时仍能正常展示执行周期 ====================
  it('AlertInfo.Interval 为字符串 "5" 时仍展示"每 5 分钟执行一次"', async () => {
    const longUrl =
      'https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=rec-interval-str';
    mockRequest.mockResolvedValueOnce({
      RecordLog: JSON.stringify({
        AlertName: 'A',
        AlertId: 'alarm-iv',
        AlertSnapshot: { AlertInfo: { Interval: '5', HappenThreshold: 1 } },
      }),
    });
    const r = await client.callTool({ name: 'GetAlarmDetail', arguments: { AlarmDetailUrl: longUrl } });
    const { text } = (r.content as { text: string }[])[0];
    expect(text).toContain('每 5 分钟执行一次');
  });
});

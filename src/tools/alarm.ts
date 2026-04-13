import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  DescribeAlarmsRequest,
  DescribeAlarmNoticesRequest,
  DescribeAlarmShieldsRequest,
  DescribeAlertRecordHistoryRequest,
  DescribeNoticeContentsRequest,
  DescribeWebCallbacksRequest,
  GetAlarmLogRequest,
} from 'tencentcloud-sdk-nodejs-cls/tencentcloud/services/cls/v20201016/cls_models.js';
import { z } from 'zod';

import {
  CreateClsClientFn,
  McpServerInstance,
  filtersSchema,
  MS_TIMESTAMP_FROM_DESC,
  MS_TIMESTAMP_TO_DESC,
  NO_REGION_PROVIDED_ERROR_MESSAGE,
  paginationSchema,
  regionSchema,
} from '../constants';
import { formatResponse } from '../utils';

// ==================== Helper functions for GetAlarmDetail ====================

/**
 * 检查 URL 是否在允许的域名列表中
 */
function isAllowedAlarmUrl(url: string): boolean {
  return (
    url.startsWith('https://alarm.cls.tencentcs.com') ||
    url.startsWith('https://mc.tencent.com') ||
    url.includes('monitor.cls.tencentcs.com')
  );
}

/**
 * 修正常见的 URL 格式错误
 */
function fixUrlFormat(url: string): string {
  return url
    .replace(/^httpss:\/\//, 'https://')
    .replace(/^httpp:\/\//, 'http://')
    .replace(/^https\.:\/\//, 'https://')
    .replace(/^https\./, 'https://')
    .replace(/^http\.:\/\//, 'http://')
    .replace(/^http\./, 'http://');
}

/**
 * 尝试从 URL 中直接提取 RecordId（不发起网络请求）
 */
function tryExtractRecordId(url: string): string | null {
  const match = /RecordId=([^&]+)/.exec(url);
  return match ? match[1] : null;
}

/**
 * 解析告警 URL，获取最终可解析的长链。
 * 如果 URL 已包含 RecordId（长链），直接返回，无需发起网络请求。
 * 仅当 URL 为短链（不含 RecordId）时才 fetch 跟踪重定向。
 * 这样兼容客户环境无法访问公网的场景。
 */
async function resolveRedirectUrl(url: string): Promise<string> {
  // 长链已包含 RecordId，无需网络请求
  if (tryExtractRecordId(url)) {
    return url;
  }

  // 短链需要 fetch 获取重定向目标
  const response = await fetch(url, { redirect: 'manual' });
  if (response.status === 301 || response.status === 302) {
    const location = response.headers.get('location');
    if (location) {
      return location;
    }
  }
  // 不是重定向，返回原 URL
  return url;
}

/**
 * 从长链 URL 解析出 host 和 RecordId
 */
function parseAlarmDetailUrl(longUrl: string): { host: string; recordId: string; region: string } {
  // 长链格式: https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=xxx
  const parsed = new URL(longUrl);
  const host = parsed.hostname;

  // 从 host 提取 region: ap-guangzhou-monitor.cls.tencentcs.com → ap-guangzhou
  const region = host.split('-monitor')[0];

  // RecordId 可能在 query 参数或 hash 部分
  let recordId = parsed.searchParams.get('RecordId') || '';
  if (!recordId) {
    // 检查 hash: #/alert?RecordId=xxx
    const hashPart = parsed.hash || '';
    const hashMatch = /RecordId=([^&]+)/.exec(hashPart);
    if (hashMatch) {
      recordId = hashMatch[1];
    }
  }
  // 也检查完整 URL（有些情况 hash 解析可能丢失）
  if (!recordId) {
    const urlMatch = /RecordId=([^&]+)/.exec(longUrl);
    if (urlMatch) {
      recordId = urlMatch[1];
    }
  }

  if (!host || !recordId) {
    throw new Error('告警链接无效，无法从跳转地址中提取 host 和 RecordId。');
  }

  return { host, recordId, region };
}

/**
 * 格式化告警详情为 Markdown（适配 DescribeAlarmDetail API 返回的 RecordLog JSON 结构）
 */
function formatAlarmDetail(record: any): string {
  const parts: string[] = [];

  parts.push('### ⚠️ 1.告警基本信息');
  parts.push(`- 告警名称: ${record?.AlertName || '未知'}`);
  parts.push(`- 告警ID: ${record?.AlertId || record?.AlertID || '未知'}`);
  parts.push(`- 告警等级: ${record?.Level || record?.level_zh || '未知'}`);
  parts.push(`- 地域: ${record?.Region || '未知'}`);

  parts.push('\n### 🔍 2.告警详细数据');
  parts.push(`- 监控对象: ${record?.TopicName || record?.TopicId || '未知'}`);
  if (record?.StartTime) parts.push(`- 告警首次触发时间: ${record.StartTime}`);
  if (record?.NotifyTime) parts.push(`- 通知时间: ${record.NotifyTime}`);
  if (record?.Duration !== undefined) parts.push(`- 持续时间: ${record.Duration}分钟`);
  if (record?.Trigger) parts.push(`- 触发条件: ${record.Trigger}`);
  if (record?.TriggerParams) parts.push(`- 触发数据: ${record.TriggerParams}`);
  if (record?.Condition) parts.push(`- 告警条件: ${record.Condition}`);

  if (record?.Query) {
    parts.push('\n### 📝 3.触发语句');
    parts.push(`- CQL查询语句: \`${record.Query}\``);
  }

  if (record?.CustomizeMessage) {
    parts.push('\n### 📢 4.通知内容');
    parts.push(`- ${record.CustomizeMessage}`);
  }

  // 多维分析结果
  const analysisInfos = record?.AnalysisInfo || [];
  if (analysisInfos.length > 0) {
    parts.push('\n### 📊 5.多维分析结果');
    for (const analysis of analysisInfos) {
      parts.push(`\n#### 🔹 ${analysis.Name || '分析'}`);

      if (analysis.Type === 'field' && analysis.FieldValueRatioInfos?.length) {
        parts.push('| 值 | 出现次数 | 百分比 |');
        parts.push('| --- | --- | --- |');
        for (const item of analysis.FieldValueRatioInfos) {
          parts.push(`| ${item.Value || ''} | ${item.Count || 0} | ${item.Ratio || '0%'} |`);
        }
      } else if (analysis.Type === 'query' && analysis.AnalysisResults?.length) {
        const results = analysis.AnalysisResults;
        const keys = Object.keys(results[0] || {});
        if (keys.length > 0) {
          parts.push(`| ${keys.join(' | ')} |`);
          parts.push(`| ${keys.map(() => '---').join(' | ')} |`);
          for (const row of results) {
            parts.push(`| ${keys.map((k: string) => row[k] ?? '').join(' | ')} |`);
          }
        }
      } else if (analysis.Type === 'original' && analysis.AnalysisOriginal?.length) {
        for (const item of analysis.AnalysisOriginal) {
          const entries = Object.entries(item || {});
          parts.push(entries.map(([k, v]) => `${k}: ${v}`).join(', '));
        }
      }
    }
  }

  // 原始查询结果
  if (record?.RawResults?.length) {
    parts.push('\n### 📈 6.查询结果');
    for (const resultSet of record.RawResults) {
      if (Array.isArray(resultSet)) {
        for (const row of resultSet) {
          const entries = Object.entries(row || {});
          parts.push(entries.map(([k, v]) => `${k}: ${v}`).join(', '));
        }
      }
    }
  }

  return parts.join('\n');
}

// ==================== Tool Registration ====================

export function registerAlarmTools(mcpServer: McpServerInstance, createClsClient: CreateClsClientFn): void {
  mcpServer.registerTool(
    'DescribeAlarms',
    {
      description:
        '获取 CLS 告警策略列表。查询指定地域的告警策略列表，支持按告警策略启用状态等条件过滤和分页。\n\n' +
        '支持的过滤条件（Filters 参数）：\n' +
        '- name: 按告警策略名称过滤\n' +
        '- alarmId: 按告警策略 ID 过滤\n' +
        '- topicId: 按监控对象的日志主题 ID 过滤\n' +
        `- enable: 按启用状态过滤（1=启用，0=禁用），如 [{Key: 'enable', Values: ['1']}]`,
      inputSchema: {
        Region: regionSchema,
        Filters: filtersSchema,
        ...paginationSchema,
      },
    },
    async ({ Region: regionFromAI, Filters, Offset = 0, Limit = 20 }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: DescribeAlarmsRequest = {
          ...(Filters !== undefined && { Filters }),
          Offset,
          Limit,
        };

        const response = await clsClient.DescribeAlarms(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'DescribeAlertRecordHistory',
    {
      description:
        '获取 CLS 告警历史记录。查询指定时间范围内的告警历史记录，包含告警触发、恢复等事件的详细信息，用于分析告警趋势和排查告警问题。\n\n' +
        '支持的过滤条件（Filters 参数）：\n' +
        '- alarmId: 按告警策略 ID 过滤\n' +
        '- alarmName: 按告警策略名称过滤\n' +
        '- topicId: 按日志主题 ID 过滤\n' +
        '- status: 按告警状态过滤（0-未恢复，1-已恢复）\n\n' +
        '返回信息包含：TotalCount（总数）、Records 列表（每条记录含 RecordId、AlarmId、AlarmName、TopicId、TopicName、Region、Trigger、TriggerCount、AlarmLevel、Status、CreateTime、Duration、NotifyStatus）。',
      inputSchema: {
        Region: regionSchema,
        From: z.number().describe(MS_TIMESTAMP_FROM_DESC),
        To: z.number().describe(MS_TIMESTAMP_TO_DESC),
        Filters: filtersSchema,
        ...paginationSchema,
      },
    },
    async ({ Region: regionFromAI, From, To, Filters, Offset = 0, Limit = 20 }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: DescribeAlertRecordHistoryRequest = {
          From,
          To,
          ...(Filters !== undefined && { Filters }),
          Offset,
          Limit,
        };

        const response = await clsClient.DescribeAlertRecordHistory(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'GetAlarmLog',
    {
      description:
        '获取 CLS 告警执行详情日志。查询指定时间范围内的告警策略执行详情，包括执行时间、结果、触发的日志内容等。\n\n' +
        '查询语法说明：\n' +
        '- * : 查询所有告警策略的执行详情\n' +
        '- AlarmId:"alarm-xxx" : 查询指定告警策略的执行详情\n' +
        '- AlarmName:"告警名称" : 按告警名称查询\n' +
        '- 组合查询：AlarmId:"alarm-xxx" AND Status:"success"\n\n' +
        '分页说明：首次不传 Context；若返回 ListOver 为 false，用返回的 Context 获取后续数据。\n\n' +
        '返回信息包含：Results 列表（每条含 AlarmId、AlarmName、TopicId、TopicName、Trigger、TriggerCount、AlarmLevel、Status、CreateTime、Duration、NotifyStatus、Content）、Context（分页标识）、ListOver（是否查询完毕）。',
      inputSchema: {
        Region: regionSchema,
        From: z.number().describe(MS_TIMESTAMP_FROM_DESC),
        To: z.number().describe(MS_TIMESTAMP_TO_DESC),
        Query: z.string().describe('查询过滤条件，支持 CLS 查询语法，如 * 表示查询所有。'),
        Limit: z.number().optional().default(100).describe('单次返回条数，最大 1000，默认 100。'),
        Context: z.string().optional().describe('上下文标识符，用于分页查询获取后续数据。'),
        Sort: z.string().optional().default('desc').describe('排序方式：asc（升序）、desc（降序），默认 desc。'),
      },
    },
    async ({ Region: regionFromAI, From, To, Query, Limit = 100, Context, Sort }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: GetAlarmLogRequest = {
          From,
          To,
          Query,
          ...(Limit !== undefined && { Limit }),
          ...(Context !== undefined && { Context }),
          ...(Sort !== undefined && { Sort }),
        };

        const response = await clsClient.GetAlarmLog(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'DescribeAlarmNotices',
    {
      description:
        '获取 CLS 通知渠道组列表。查询指定地域下的通知渠道组列表，通知渠道组用于配置告警通知的接收方式和接收人，包括邮件、短信、电话、企业微信等。\n\n' +
        '支持的过滤条件（Filters 参数）：\n' +
        '- name: 按通知渠道组名称过滤\n' +
        '- alarmNoticeId: 按通知渠道组 ID 过滤\n\n' +
        '返回信息包含：AlarmNoticeId、Name、NoticeReceivers、WebCallbacks、CreateTime、UpdateTime 等。',
      inputSchema: {
        Region: regionSchema,
        Filters: filtersSchema,
        ...paginationSchema,
      },
    },
    async ({ Region: regionFromAI, Filters, Offset = 0, Limit = 20 }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: DescribeAlarmNoticesRequest = {
          ...(Filters !== undefined && { Filters }),
          Offset,
          Limit,
        };

        const response = await clsClient.DescribeAlarmNotices(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'DescribeAlarmShields',
    {
      description:
        '获取 CLS 告警屏蔽规则列表。查询指定通知渠道组下的告警屏蔽规则，屏蔽规则用于在特定时间段内屏蔽告警通知，避免维护期间产生大量告警噪音。\n\n' +
        '应用场景：\n' +
        '1. 查看某个通知渠道组下配置的所有屏蔽规则\n' +
        '2. 查询当前生效的屏蔽规则（按状态过滤）\n' +
        '3. 审计和管理告警屏蔽配置\n\n' +
        '支持的过滤条件（Filters 参数）：\n' +
        `- shieldId: 按屏蔽规则 ID 过滤，如 [{Key: 'shieldId', Values: ['shield-xxx']}]\n` +
        `- name: 按屏蔽规则名称过滤，如 [{Key: 'name', Values: ['维护屏蔽']}]\n` +
        `- status: 按状态过滤（enabled=启用，disabled=禁用），如 [{Key: 'status', Values: ['enabled']}]`,
      inputSchema: {
        Region: regionSchema,
        AlarmNoticeId: z.string().describe('通知渠道组 ID，必填参数。可通过 DescribeAlarmNotices 工具获取。'),
        Filters: filtersSchema,
        ...paginationSchema,
      },
    },
    async ({ Region: regionFromAI, AlarmNoticeId, Filters, Offset = 0, Limit = 20 }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: DescribeAlarmShieldsRequest = {
          AlarmNoticeId,
          ...(Filters !== undefined && { Filters }),
          Offset,
          Limit,
        };

        const response = await clsClient.DescribeAlarmShields(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'DescribeNoticeContents',
    {
      description:
        '获取 CLS 通知内容模板列表。查询指定地域下的通知内容模板，模板定义告警触发和恢复时的消息内容，支持邮件、短信、企业微信、Webhook 等渠道。\n\n' +
        '支持的过滤条件（Filters 参数）：\n' +
        '- name: 按模板名称过滤\n' +
        '- noticeContentId: 按模板 ID 过滤\n\n' +
        '返回信息包含：NoticeContentId、Name、Type、NoticeContents（各渠道内容配置）、CreateTime、UpdateTime 等。',
      inputSchema: {
        Region: regionSchema,
        Filters: filtersSchema,
        ...paginationSchema,
      },
    },
    async ({ Region: regionFromAI, Filters, Offset = 0, Limit = 20 }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: DescribeNoticeContentsRequest = {
          ...(Filters !== undefined && { Filters }),
          Offset,
          Limit,
        };

        const response = await clsClient.DescribeNoticeContents(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'DescribeWebCallbacks',
    {
      description:
        '获取 CLS 告警回调配置列表。查询指定地域下的 Webhook 回调配置，用于在告警触发或恢复时向指定 URL 发送 HTTP 通知，常用于与第三方监控系统或自动化运维系统集成。\n\n' +
        '支持的过滤条件（Filters 参数）：\n' +
        '- name: 按回调配置名称过滤\n' +
        '- callbackId: 按回调配置 ID 过滤\n\n' +
        '返回信息包含：CallbackId、Name、Url、Method、Headers、Body、CreateTime、UpdateTime 等。',
      inputSchema: {
        Region: regionSchema,
        Filters: filtersSchema,
        ...paginationSchema,
      },
    },
    async ({ Region: regionFromAI, Filters, Offset = 0, Limit = 20 }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: DescribeWebCallbacksRequest = {
          ...(Filters !== undefined && { Filters }),
          Offset,
          Limit,
        };

        const response = await clsClient.DescribeWebCallbacks(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'GetAlarmDetail',
    {
      description:
        '通过告警详情 URL 获取 CLS 告警的详细信息。从告警通知中的 URL 提取并解析告警信息，支持短链接和长链接格式。\n\n' +
        '支持的 URL 格式：\n' +
        '1. 短链接：https://alarm.cls.tencentcs.com/WeNZ5sSP\n' +
        '2. 短链接：https://mc.tencent.com/xxx\n' +
        '3. 长链接：https://ap-guangzhou-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=xxx\n\n' +
        '返回 Markdown 格式的告警详细信息，包含：\n' +
        '- 告警基本信息（名称、ID、地域）\n' +
        '- 告警详细数据（监控对象、触发时间、持续时间、触发条件）\n' +
        '- 触发语句（CQL 查询）\n' +
        '- 多维分析结果（字段分布、查询结果表格）\n\n' +
        '应用场景：直接粘贴告警通知中的 URL 即可获取完整告警信息，用于快速排查和分析。',
      inputSchema: {
        AlarmDetailUrl: z.string().describe('告警详情 URL，支持短链接和长链接格式。'),
      },
    },
    async ({ AlarmDetailUrl }): Promise<CallToolResult> => {
      try {
        if (!AlarmDetailUrl) {
          throw new Error('告警地址 URL 为空。');
        }

        // 修正常见 URL 格式错误
        const fixedUrl = fixUrlFormat(AlarmDetailUrl.trim());

        // 验证 URL 是否在允许的域名列表中
        if (!isAllowedAlarmUrl(fixedUrl)) {
          throw new Error(
            `不允许的告警地址 URL: ${fixedUrl}。仅支持 alarm.cls.tencentcs.com、mc.tencent.com 或 monitor.cls.tencentcs.com 域名。`,
          );
        }

        // 解析短链重定向获取长链
        const longUrl = await resolveRedirectUrl(fixedUrl);

        // 从长链中提取 host、RecordId、region
        const { recordId, region } = parseAlarmDetailUrl(longUrl);

        // 通过 CLS API 获取告警详情
        const clsClient = createClsClient(region);
        const response = await clsClient.request('DescribeAlarmDetail', { RecordId: recordId });

        const recordLogStr = response?.RecordLog;
        if (!recordLogStr) {
          return formatResponse('告警详情为空，可能告警记录已过期或 URL 无效。', true);
        }

        // RecordLog 是 JSON 字符串，解析后格式化
        let recordLog: any;
        try {
          recordLog = JSON.parse(recordLogStr);
        } catch {
          // 如果解析失败，直接返回原始字符串
          return formatResponse(recordLogStr);
        }

        // 格式化为 Markdown
        const markdown = formatAlarmDetail(recordLog);
        return formatResponse(markdown);
      } catch (e: any) {
        return formatResponse(
          { message: `请求告警详情出错: ${String(e?.message || e)}。注意：请检查告警地址是否正确。`, stack: e?.stack },
          true,
        );
      }
    },
  );
}

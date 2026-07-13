import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import moment from 'moment-timezone';
import { z } from 'zod';

import {
  CreateClsClientFn,
  ISO_8601_TIME_FORMAT,
  McpServerInstance,
  DEFAULT_TIME_ZONE,
  NO_REGION_PROVIDED_ERROR_MESSAGE,
  paginationSchema,
  regionSchema,
} from '../constants';
import { extractRegionMainName, fetchClsRegionList, formatResponse } from '../utils';

/**
 * 将非空的字符串过滤条件加入 Filters 数组。
 * 同时排除 null / undefined / 空字符串，避免向云 API 发送无效过滤条件。
 */
function addStringFilter(filters: { Key: string; Values: string[] }[], key: string, value: string | undefined): void {
  if (value != null && value !== '') {
    filters.push({ Key: key, Values: [value] });
  }
}

export function registerUtilityTools(mcpServer: McpServerInstance, createClsClient: CreateClsClientFn): void {
  mcpServer.registerTool(
    'DescribeTopics',
    {
      description:
        '按名称搜索日志主题或指标主题信息，返回主题 ID、名称、保留周期等信息。\n\n' +
        '支持的过滤条件：\n' +
        '- TopicId：按主题 ID 过滤（精确匹配）\n' +
        '- TopicName：按主题名称过滤（默认模糊匹配）\n' +
        '- LogsetId：按日志集 ID 过滤（精确匹配）\n' +
        '- LogsetName：按日志集名称过滤（默认模糊匹配）\n\n' +
        'PreciseSearch 控制模糊/精确匹配：0=两者均模糊（默认），1=TopicName 精确，2=LogsetName 精确，3=两者均精确。\n\n' +
        '返回信息包含：TopicId、TopicName、LogsetId、LogsetName、Region、StorageType（hot/cold）、Period。',
      inputSchema: {
        Region: regionSchema,
        TopicId: z.string().optional().describe('按主题 ID 过滤（精确匹配）。'),
        TopicName: z
          .string()
          .optional()
          .describe('按主题名称过滤。默认模糊匹配；设置 PreciseSearch=1 或 3 可切换为精确匹配。'),
        LogsetId: z.string().optional().describe('按日志集 ID 过滤（精确匹配）。'),
        LogsetName: z
          .string()
          .optional()
          .describe('按日志集名称过滤。默认模糊匹配；设置 PreciseSearch=2 或 3 可切换为精确匹配。'),
        PreciseSearch: z
          .number()
          .int()
          .min(0)
          .max(3)
          .optional()
          .default(0)
          .describe(
            '控制 TopicName / LogsetName 的精确/模糊匹配：0=两者均模糊（默认），1=TopicName 精确，2=LogsetName 精确，3=两者均精确。对 TopicId / LogsetId 无效（始终精确匹配）。',
          ),
        ...paginationSchema,
        BizType: z
          .number()
          .int()
          .refine((v) => v === 0 || v === 1, { message: 'BizType 必须为 0（日志主题）或 1（指标主题）' })
          .optional()
          .default(0)
          .describe('主题类型。0：日志主题（默认值）；1：指标主题。查询指标主题时需传入 1。'),
      },
    },
    async ({
      Region: regionFromAI,
      TopicId,
      TopicName,
      LogsetId,
      LogsetName,
      PreciseSearch,
      Offset,
      Limit,
      BizType,
    }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }

        const clsClient = createClsClient(region);

        const filters: { Key: string; Values: string[] }[] = [];
        addStringFilter(filters, 'topicId', TopicId);
        addStringFilter(filters, 'topicName', TopicName);
        addStringFilter(filters, 'logsetId', LogsetId);
        addStringFilter(filters, 'logsetName', LogsetName);

        const response = await clsClient.DescribeTopics({
          Filters: filters,
          PreciseSearch,
          Offset,
          Limit,
          BizType,
        });

        // 只回精简的展示字段，屏蔽 AssumerUin/RoleName/Tags 等模型用不上的元信息，控制 tool_result 体积。
        // 注意：SDK 的 TopicInfo 类型未声明 LogsetInfo 字段，但云 API 实际会返回该嵌套对象，
        // 因此使用 any 类型断言访问，避免 @ts-ignore 在未来 SDK 类型更新时静默掩盖字段名变更。
        const topics = (response?.Topics || []).map((t) => ({
          TopicId: t.TopicId,
          TopicName: t.TopicName,
          LogsetId: t.LogsetId,
          LogsetName: (t as any).LogsetInfo?.LogsetName || undefined,
          Region: region,
          StorageType: t.StorageType,
          Period: t.Period,
        }));
        return formatResponse({ Topics: topics, TotalCount: response?.TotalCount, RequestId: response?.RequestId });
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'DescribeLogsets',
    {
      description:
        '获取 CLS 日志集列表。查询指定地域下的日志集，支持按日志集名称、日志集 ID 过滤。\n\n' +
        '日志集是日志主题的容器，用于区分不同项目。当多个项目存在同名日志主题时，可通过日志集区分。\n\n' +
        '支持的过滤条件：\n' +
        '- LogsetName：按日志集名称过滤（模糊匹配）\n' +
        '- LogsetId：按日志集 ID 过滤（精确匹配）\n' +
        '返回信息包含：LogsetId（日志集 ID）、LogsetName（日志集名称）、Region（地域）、CreateTime（创建时间）、TopicCount（日志主题数目）、MetricTopicCount（指标主题数目）。',
      inputSchema: {
        Region: regionSchema,
        LogsetId: z.string().optional().describe('按日志集 ID 过滤（精确匹配）。'),
        LogsetName: z.string().optional().describe('按日志集名称过滤。模糊匹配。'),
        ...paginationSchema,
      },
    },
    async ({ Region: regionFromAI, LogsetId, LogsetName, Offset, Limit }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);
        const filters: { Key: string; Values: string[] }[] = [];
        addStringFilter(filters, 'logsetId', LogsetId);
        addStringFilter(filters, 'logsetName', LogsetName);
        const response = await clsClient.DescribeLogsets({
          Filters: filters,
          Offset,
          Limit,
        });
        const logsets = (response?.Logsets || []).map((l) => ({
          LogsetId: l.LogsetId,
          LogsetName: l.LogsetName,
          Region: region,
          CreateTime: l.CreateTime,
          TopicCount: l.TopicCount,
          MetricTopicCount: l.MetricTopicCount,
        }));
        return formatResponse({ Logsets: logsets, TotalCount: response?.TotalCount, RequestId: response?.RequestId });
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'GetRegionCodeByName',
    {
      description: '按地域名称搜索腾讯云地域参数代码（如"广州"→"ap-guangzhou"），支持中文和英文名称模糊匹配。',
      inputSchema: {
        searchText: z.string().describe('地域名称，如 Hong Kong 或 广州'),
        language: z
          .string()
          .optional()
          .default('zh-CN')
          .describe('搜索文本的语言，"zh-CN"（中文，默认）或 "en-US"（英文）'),
      },
    },
    async ({ searchText, language }) => {
      try {
        const lang: 'zh-CN' | 'en-US' = language === 'en-US' ? 'en-US' : 'zh-CN';
        // 通过 fetchClsRegionList 取地域列表,与 GetAlarmDetail 共享缓存,避免重复网络请求。
        const regionSet = await fetchClsRegionList(lang);
        const search = searchText.toUpperCase();
        // 优先尝试精确匹配:括号内主名 或 region 代码
        let foundRegionItem = regionSet.find((r) => {
          const mainName = extractRegionMainName(r.RegionName).toUpperCase();
          return search === mainName || search === r.Region.toUpperCase();
        });
        if (!foundRegionItem) {
          foundRegionItem = regionSet.find(
            (r) => r.RegionName?.toUpperCase()?.includes(search) || r.Region?.toUpperCase()?.includes(search),
          );
        }
        return formatResponse(foundRegionItem?.Region);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'ConvertTimeStringToTimestamp',
    {
      description:
        '将时间字符串转换为毫秒或秒级时间戳。常用于为 SearchLog、DescribeLogHistogram 等工具的 From/To 参数准备时间戳。',
      inputSchema: {
        timeString: z
          .string()
          .describe(
            `要转换的时间字符串，如 2026-01-07T02:34:53.623Z。强烈建议使用 ISO 8601 格式（${ISO_8601_TIME_FORMAT}）。若非 ISO 8601 格式，必须同时提供 timeFormat 参数。`,
          ),
        timeFormat: z
          .string()
          .optional()
          .default(ISO_8601_TIME_FORMAT)
          .describe(
            `时间格式，如 ${ISO_8601_TIME_FORMAT}。默认 ISO 8601 格式。若 timeString 非 ISO 8601 格式则必须提供。`,
          ),
        timeZone: z
          .string()
          .optional()
          .default(DEFAULT_TIME_ZONE)
          .describe('时区，如 Asia/Shanghai。若 timeString 不含时区偏移信息则必须提供。'),
        unit: z
          .enum(['milliseconds', 'seconds'])
          .optional()
          .default('milliseconds')
          .describe('返回时间戳的单位。"milliseconds"（毫秒，默认）或 "seconds"（秒）。'),
      },
    },
    ({ timeString, timeFormat = ISO_8601_TIME_FORMAT, timeZone = DEFAULT_TIME_ZONE, unit }) => {
      if (!timeString) {
        throw new Error('no timeString provided.');
      }
      const ms = moment.tz(timeString, timeFormat, timeZone).valueOf();
      return formatResponse(unit === 'seconds' ? Math.floor(ms / 1000) : ms);
    },
  );

  mcpServer.registerTool(
    'ConvertTimestampToTimeString',
    {
      description:
        '将时间戳转换为时间字符串。不传 timestamp 参数时返回当前时间，常用于获取当前时间后计算 SearchLog 等工具所需的时间范围。',
      inputSchema: {
        timestamp: z.number().optional().describe('要转换的时间戳。不传则返回当前时间。单位由 unit 参数决定。'),
        unit: z
          .enum(['milliseconds', 'seconds'])
          .optional()
          .default('milliseconds')
          .describe('输入时间戳的单位。"milliseconds"（毫秒，默认）或 "seconds"（秒）。'),
        timeFormat: z
          .string()
          .optional()
          .default(ISO_8601_TIME_FORMAT)
          .describe(`输出时间格式，如 ${ISO_8601_TIME_FORMAT}。默认 ISO 8601 格式。`),
        timeZone: z
          .string()
          .optional()
          .default(DEFAULT_TIME_ZONE)
          .describe('输出时区，如 Asia/Shanghai。默认使用系统时区。'),
      },
    },
    ({ timestamp, unit, timeFormat = ISO_8601_TIME_FORMAT, timeZone = DEFAULT_TIME_ZONE }) => {
      if (!timestamp) {
        timestamp = Date.now();
      } else if (unit === 'seconds') {
        timestamp = timestamp * 1000;
      }
      return formatResponse(moment(timestamp).tz(timeZone).format(timeFormat));
    },
  );
}

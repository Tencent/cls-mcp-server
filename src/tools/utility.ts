import moment from 'moment-timezone';
import { z } from 'zod';

import {
  CreateClsClientFn,
  ISO_8601_TIME_FORMAT,
  McpServerInstance,
  defaultTimeZone,
  noRegionProvidedErrorMessage,
  regionSchema,
} from '../constants';
import { RegionClient, capiClientVersion, formatResponse } from '../utils';

export function registerUtilityTools(mcpServer: McpServerInstance, createClsClient: CreateClsClientFn): void {
  mcpServer.registerTool(
    'GetTopicInfoByName',
    {
      description: '按名称搜索日志主题或指标主题信息，返回主题 ID、名称、保留周期等信息。',
      inputSchema: {
        searchText: z.string().optional().describe('搜索日志主题名称。不传则返回所有主题。'),
        preciseSearch: z
          .boolean()
          .default(false)
          .describe('是否精确匹配（true）或模糊匹配（false），默认 false。推荐使用模糊匹配。'),
        Region: regionSchema,
        offset: z.number().optional().default(0).describe('分页偏移量，默认 0'),
        limit: z.number().optional().default(20).describe('单页返回数量，默认 20'),
        bizType: z
          .number()
          .optional()
          .default(0)
          .describe('主题类型。0：日志主题（默认值）；1：指标主题。查询指标主题时需传入 1。'),
      },
    },
    async ({ Region: regionFromAI, searchText, preciseSearch, offset = 0, limit = 20, bizType }) => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(noRegionProvidedErrorMessage, true);
        }

        const clsClient = createClsClient(region);

        const response = await clsClient.DescribeTopics({
          Filters: searchText
            ? [
                {
                  Key: 'topicName',
                  Values: [searchText],
                },
              ]
            : [],
          PreciseSearch: preciseSearch ? 1 : 0,
          Offset: offset,
          Limit: limit,
          ...(bizType !== undefined && { BizType: bizType }),
        });
        const topics = response?.Topics?.map((topic: any) => ({
          TopicName: topic.TopicName,
          TopicId: topic.TopicId,
          Period: topic.Period,
        }));
        return formatResponse({ ...response, Topics: topics });
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
        const cloudApiBaseHost = process.env.TENCENTCLOUD_API_BASE_HOST || 'tencentcloudapi.com';
        const regionClient = new RegionClient({
          credential: {
            secretId: process.env.TENCENTCLOUD_SECRET_ID,
            secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
          },
          region: process.env.TENCENTCLOUD_REGION || 'ap-guangzhou',
          profile: {
            language: language as 'zh-CN' | 'en-US',
            httpProfile: {
              endpoint: `region.${cloudApiBaseHost}`,
            },
          },
        });
        regionClient.sdkVersion = capiClientVersion;

        const response = await regionClient.DescribeRegions({
          Product: 'cls',
        });
        // 优先尝试精确匹配
        let foundRegionItem = response.RegionSet?.find((region: any) => {
          const regionName = /[\u4e00-\u9fa5]+\(([\u4e00-\u9fa5]+)\)/.exec(region.RegionName)?.[1] || '';
          return (
            searchText.toUpperCase() === regionName.toUpperCase() ||
            searchText.toUpperCase() === region.Region.toUpperCase()
          );
        });
        if (!foundRegionItem) {
          foundRegionItem = response.RegionSet?.find(
            (region: any) =>
              region.RegionName?.toUpperCase()?.includes(searchText.toUpperCase()) ||
              region.Region?.toUpperCase()?.includes(searchText.toUpperCase()),
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
          .default(defaultTimeZone)
          .describe('时区，如 Asia/Shanghai。若 timeString 不含时区偏移信息则必须提供。'),
        unit: z
          .enum(['milliseconds', 'seconds'])
          .optional()
          .default('milliseconds')
          .describe('返回时间戳的单位。"milliseconds"（毫秒，默认）或 "seconds"（秒）。'),
      },
    },
    ({ timeString, timeFormat = ISO_8601_TIME_FORMAT, timeZone = defaultTimeZone, unit }) => {
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
          .default(defaultTimeZone)
          .describe('输出时区，如 Asia/Shanghai。默认使用系统时区。'),
      },
    },
    ({ timestamp, unit, timeFormat = ISO_8601_TIME_FORMAT, timeZone = defaultTimeZone }) => {
      if (!timestamp) {
        timestamp = Date.now();
      } else if (unit === 'seconds') {
        timestamp = timestamp * 1000;
      }
      return formatResponse(moment(timestamp).tz(timeZone).format(timeFormat));
    },
  );
}

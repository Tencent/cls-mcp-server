#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import 'dotenv/config';
import express from 'express';
import moment from 'moment-timezone';
import { cls } from 'tencentcloud-sdk-nodejs-cls';
import {
  DescribeLogContextRequest,
  SearchLogRequest,
} from 'tencentcloud-sdk-nodejs-cls/tencentcloud/services/cls/v20201016/cls_models.js';
import { region } from 'tencentcloud-sdk-nodejs-region';
import { z } from 'zod';

// console.log(process.env); // remove this after you've confirmed it is working

const capiClientVersion = `cls-mcp-server-${process.env.CLS_MCP_SERVER_VERSION}`;
const ClsClient = cls.v20201016.Client;
const RegionClient = region.v20220627.Client;

// Initialize MCP server
const mcpServer = new McpServer({
  name: 'cls-mcp-server',
  version: '1.0.0',
});

const regionSchema = z.string().describe('地域信息，必选，如：ap-guangzhou。');
const noRegionProvidedErrorMessage =
  'no Region is provided. AI model should ask user to specify region first, and provide Region parameter to mcp tool.';

const MultiTopicSearchInformationSchema = z.object({
  TopicId: z.string().optional().describe('要检索分析的日志主题ID'),
});
const SearchLogRequestSchema = {
  From: z
    .number()
    .describe(
      '要检索分析的日志的起始时间，Unix时间戳（毫秒单位）。应当先调用 ConvertTimestampToTimeString 工具获取当前时间(不传timestamp参数就是获取当前时间)，基于时间字符串计算好From、To参数后，再调用 ConvertTimeStringToTimestamp 工具获取时间戳。To减去From的时间范围建议不要过大，建议默认近15分钟，否则会导致返回的日志过多，影响性能。',
    ),
  To: z
    .number()
    .describe(
      '要检索分析的日志的结束时间，Unix时间戳（毫秒单位）。应当先调用 ConvertTimestampToTimeString 工具获取当前时间(不传timestamp参数就是获取当前时间)，基于时间字符串计算好From、To参数后，再调用 ConvertTimeStringToTimestamp 工具获取时间戳。To减去From的时间范围建议不要过大，建议默认近15分钟，否则会导致返回的日志过多，影响性能。',
    ),
  Query: z.string().describe('检索分析语句，最大长度为12KB。如果不限定检索条件，可传 * 或 空字符串，可查询所有日志'),
  TopicId: z.string().optional().describe('要检索分析的日志主题ID，仅能指定一个日志主题'),
  Topics: z
    .array(MultiTopicSearchInformationSchema)
    .optional()
    .describe('要检索分析的日志主题列表，最大支持50个日志主题'),
  Sort: z
    .string()
    .optional()
    .default('desc')
    .describe('原始日志是否按时间排序返回；可选值：asc(升序)、desc(降序)，默认为desc'),
  Limit: z.number().optional().default(1).describe('单次查询返回的日志条数，默认为1，最大值为1000'),
  Offset: z.number().optional().default(0).describe('查询原始日志的偏移量，表示从第几行开始返回原始日志，默认为0'),
  SamplingRate: z
    .number()
    .optional()
    .default(1)
    .describe('执行统计分析时是否对原始日志先进行采样，0：自动采样；0～1：按指定采样率采样；1：不采样'),
  Region: regionSchema,
};

mcpServer.registerTool(
  'SearchLog',
  {
    description: 'Search logs based on query parameters',
    inputSchema: SearchLogRequestSchema,
    /* outputSchema: z.object({
      Analysis: z.boolean().describe('返回的是否为统计分析（即SQL）结果'),
      AnalysisRecords: z.array(z.string()).describe('统计分析（即SQL）结果。Analysis为true时，返回该字段'),
      Results: z
        .array(
          z.object({
            Time: z.number().describe('日志时间，单位ms'),
            Source: z.string().describe('日志来源IP'),
            FileName: z.string().describe('日志文件名称'),
            PkgId: z
              .string()
              .describe(
                '日志上报请求包的ID。结合 PkgLogId 一起，可作为参数通过 DescribeLogContext 工具获取日志上下文信息。',
              ),
            PkgLogId: z
              .string()
              .describe(
                '请求包内日志的ID。结合 PkgId 一起，可作为参数通过 DescribeLogContext 工具获取日志上下文信息。',
              ),
            LogJson: z.string().describe('日志内容的Json序列化字符串'),
            HostName: z.string().describe('日志来源主机名称'),
          }),
        )
        .describe('匹配检索条件的原始日志。Analysis为false时，返回该字段'),
    }), */
  },
  async ({
    From,
    To,
    Query,
    TopicId,
    Topics,
    Sort,
    Limit,
    Offset,
    SamplingRate,
    Region: regionFromAI,
  }): Promise<CallToolResult> => {
    try {
      const region = regionFromAI;
      if (!region) {
        return formatResponse(noRegionProvidedErrorMessage, true);
      }
      const cloudApiBaseHost = process.env.TENCENTCLOUD_API_BASE_HOST || 'tencentcloudapi.com';
      const clsClient = new ClsClient({
        credential: {
          secretId: process.env.TENCENTCLOUD_SECRET_ID,
          secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
        },
        region,
        profile: {
          language: 'zh-CN',
          httpProfile: {
            endpoint: `cls.${cloudApiBaseHost}`,
          },
        },
      });
      clsClient.sdkVersion = capiClientVersion;

      const capiParams: SearchLogRequest = {
        SyntaxRule: 1,
        UseNewAnalysis: true,
        From,
        To,
        Query,
        Limit: 10,
        ...(TopicId && {
          TopicId,
        }),
        ...(Topics && {
          Topics,
        }),
        ...(Sort && {
          Sort,
        }),
        ...(Limit && {
          Limit,
        }),
        ...(Offset && {
          Offset,
        }),
        ...(SamplingRate && {
          SamplingRate,
        }),
      };

      const response = await clsClient.SearchLog(capiParams);
      if (response.Analysis) {
        return formatResponse(response.AnalysisRecords);
      }
      return formatResponse(
        response.Results?.map((result) => ({
          Time: result.Time,
          Source: result.Source,
          FileName: result.FileName,
          PkgId: result.PkgId,
          PkgLogId: result.PkgLogId,
          LogJson: result.LogJson,
          HostName: result.HostName,
        })),
      );
    } catch (e: any) {
      return formatResponse({ message: e?.toString ? e.toString() : e?.message, stack: e?.stack, ...e }, true);
    }
  },
);

export const TIMEZONE_SHANGHAI = 'Asia/Shanghai';
export const SEARCH_TIME_TEXT_FORMAT = 'YYYY-MM-DD HH:mm:ss.SSS';
export const ISO_8601_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss.sssZ';
mcpServer.registerTool(
  'DescribeLogContext',
  {
    description: '搜索日志上下文附近的内容',
    inputSchema: {
      Region: regionSchema,
      TopicId: z.string().describe('要检索分析的日志主题ID，仅能指定一个日志主题'),
      Time: z
        .number()
        .describe('日志时间，单位ms。通过 SearchLog 工具检索原始日志时，Results 结构体中会返回 Time 字段。'),
      PkgId: z
        .string()
        .describe('日志上报请求包的ID。通过 SearchLog 工具检索原始日志时，Results 结构体中会返回 PkgId 字段。'),
      PkgLogId: z
        .string()
        .describe('请求包内日志的ID。通过 SearchLog 工具检索原始日志时，Results 结构体中会返回 PkgLogId 字段。'),
      PrevLogs: z.number().optional().default(10).describe('前${PrevLogs}条日志，默认值10。'),
      NextLogs: z.number().optional().default(10).describe('后${NextLogs}条日志，默认值10。'),
      Query: z.string().optional().describe('检索语句，对日志上下文进行过滤，不支持SQL语句。'),
      From: z.number().optional().describe('上下文检索的开始时间，单位ms。'),
      To: z.number().optional().describe('上下文检索的结束时间，单位ms。'),
    },
  },
  async ({
    Region: regionFromAI,
    TopicId,
    Time,
    PkgId,
    PkgLogId,
    PrevLogs = 10,
    NextLogs = 10,
    Query,
    From,
    To,
  }): Promise<CallToolResult> => {
    try {
      const region = regionFromAI;
      if (!region) {
        return formatResponse(noRegionProvidedErrorMessage, true);
      }
      if (!TopicId) {
        throw new Error('no TopicId is provided.');
      }
      if (!Time) {
        throw new Error('no Time is provided.');
      }
      if (!PkgId) {
        throw new Error('no PkgId is provided.');
      }
      if (!PkgLogId) {
        throw new Error('no PkgLogId is provided.');
      }
      const cloudApiBaseHost = process.env.TENCENTCLOUD_API_BASE_HOST || 'tencentcloudapi.com';
      const clsClient = new ClsClient({
        credential: {
          secretId: process.env.TENCENTCLOUD_SECRET_ID,
          secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
        },
        region,
        profile: {
          language: 'zh-CN',
          httpProfile: {
            endpoint: `cls.${cloudApiBaseHost}`,
          },
        },
      });
      clsClient.sdkVersion = capiClientVersion;

      const capiParams: DescribeLogContextRequest = {
        TopicId,
        BTime: moment(Time).tz(TIMEZONE_SHANGHAI).format(SEARCH_TIME_TEXT_FORMAT),
        PkgId,
        PkgLogId: Number(PkgLogId),
        PrevLogs,
        NextLogs,
        From,
        To,
        ...(Query && {
          Query,
        }),
        ...(From && {
          From,
        }),
        ...(To && {
          To,
        }),
      };

      const response = await clsClient.DescribeLogContext(capiParams);
      return formatResponse(response);
    } catch (e: any) {
      return formatResponse({ message: e?.toString ? e.toString() : e?.message, stack: e?.stack, ...e }, true);
    }
  },
);

mcpServer.registerTool(
  'GetTopicInfoByName',
  {
    description: 'search topic info by topic name',
    inputSchema: {
      searchText: z
        .string()
        .optional()
        .describe('Text to search, possible value: topic name. If not provided, will search all topics'),
      preciseSearch: z
        .boolean()
        .default(false)
        .describe('If precise search(true) or fuzzy search(false), default false. Recommend to use fuzzy search.'),
      Region: regionSchema,
      offset: z.number().optional().default(0).describe('Offset of the topic list, default 0'),
      limit: z.number().optional().default(20).describe('Limit of the topic list, default 20'),
    },
  },
  async ({ Region: regionFromAI, searchText, preciseSearch, offset = 0, limit = 20 }) => {
    try {
      const region = regionFromAI;
      if (!region) {
        return formatResponse(noRegionProvidedErrorMessage, true);
      }

      const cloudApiBaseHost = process.env.TENCENTCLOUD_API_BASE_HOST || 'tencentcloudapi.com';
      const clsClient = new ClsClient({
        credential: {
          secretId: process.env.TENCENTCLOUD_SECRET_ID,
          secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
        },
        region,
        profile: {
          language: 'zh-CN',
          httpProfile: {
            endpoint: `cls.${cloudApiBaseHost}`,
          },
        },
      });
      clsClient.sdkVersion = capiClientVersion;

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
      });
      const topics = response?.Topics?.map((topic) => ({
        TopicName: topic.TopicName,
        TopicId: topic.TopicId,
        Period: topic.Period,
      }));
      return formatResponse({ ...response, Topics: topics });
    } catch (e: any) {
      return formatResponse({ message: e?.toString ? e.toString() : e?.message, stack: e?.stack, ...e }, true);
    }
  },
);

mcpServer.registerTool(
  'GetRegionCodeByName',
  {
    description: 'search region parameter by region name',
    inputSchema: {
      searchText: z.string().describe('region name to search, e.g. Hong Kong or 广州'),
      language: z
        .string()
        .optional()
        .default('zh-CN')
        .describe('search text language, "zh-CN" or "en-US", default zh-CN'),
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
      let foundRegionItem = response.RegionSet?.find((region) => {
        const regionName = /[\u4e00-\u9fa5]+\(([\u4e00-\u9fa5]+)\)/.exec(region.RegionName)?.[1] || '';
        return (
          searchText.toUpperCase() === regionName.toUpperCase() ||
          searchText.toUpperCase() === region.Region.toUpperCase()
        );
      });
      if (!foundRegionItem) {
        foundRegionItem = response.RegionSet?.find(
          (region) =>
            region.RegionName?.toUpperCase()?.includes(searchText.toUpperCase()) ||
            region.Region?.toUpperCase()?.includes(searchText.toUpperCase()),
        );
      }
      return formatResponse(foundRegionItem?.Region);
    } catch (e: any) {
      return formatResponse({ message: e?.toString ? e.toString() : e?.message, stack: e?.stack, ...e }, true);
    }
  },
);

/* mcpServer.registerTool('GetCurrentTimestamp', { description: 'get current timestamp in milliseconds' }, () =>
  formatResponse(Date.now()),
); */

const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const defaultTimeZone = process.env.TZ || systemTimeZone || TIMEZONE_SHANGHAI;
mcpServer.registerTool(
  'ConvertTimeStringToTimestamp',
  {
    description: 'Convert time string to timestamp in milliseconds',
    inputSchema: {
      timeString: z
        .string()
        .describe(
          `Time string to convert, e.g. 2026-01-07T02:34:53.623Z. Strongly recommended to use ISO 8601 format (${ISO_8601_TIME_FORMAT}). Must provide timeFormat parameter if timeString is not ISO 8601 format.`,
        ),
      timeFormat: z
        .string()
        .optional()
        .default(ISO_8601_TIME_FORMAT)
        .describe(
          `Time format to use, e.g. ${ISO_8601_TIME_FORMAT}. Default to use ISO 8601 format (${ISO_8601_TIME_FORMAT}). Must provide timeFormat parameter if timeString is not ISO 8601 format.`,
        ),
      timeZone: z
        .string()
        .optional()
        .default(defaultTimeZone)
        .describe(
          'Time zone to use, e.g. Asia/Shanghai. Must provide timeZone parameter if timeString format does not include timezone offset information.',
        ),
    },
  },
  ({ timeString, timeFormat, timeZone }) => {
    if (!timeString) {
      throw new Error('no timeString provided.');
    }
    if (!timeFormat) {
      timeFormat = ISO_8601_TIME_FORMAT;
    }
    if (!timeZone) {
      timeZone = defaultTimeZone;
    }
    return formatResponse(moment.tz(timeString, timeFormat, timeZone).valueOf());
  },
);
mcpServer.registerTool(
  'ConvertTimestampToTimeString',
  {
    description: 'Convert timestamp to time string',
    inputSchema: {
      timestamp: z
        .number()
        .optional()
        .describe('Timestamp in milliseconds to convert, e.g. 1717286400000. Default to use current timestamp.'),
      timeFormat: z
        .string()
        .optional()
        .default(ISO_8601_TIME_FORMAT)
        .describe(
          `Time format to use, e.g. ${ISO_8601_TIME_FORMAT}. Default to use ISO 8601 format (${ISO_8601_TIME_FORMAT}).`,
        ),
      timeZone: z
        .string()
        .optional()
        .default(defaultTimeZone)
        .describe('Time zone to use, e.g. Asia/Shanghai. Default to use system time zone.'),
    },
  },
  ({ timestamp, timeFormat, timeZone }) => {
    if (!timestamp) {
      timestamp = Date.now();
    }
    if (!timeFormat) {
      timeFormat = ISO_8601_TIME_FORMAT;
    }
    if (!timeZone) {
      timeZone = defaultTimeZone;
    }
    return formatResponse(moment(timestamp).tz(timeZone).format(timeFormat));
  },
);

mcpServer.registerTool(
  'TextToSearchLogQuery',
  {
    description: 'get cls SearchLog Query with natual language generated by user',
    inputSchema: {
      Text: z
        .string()
        .describe(
          'natual language input generated by user, e.g. 查询日志条数 or Get error logs distribution over time.',
        ),
      Region: regionSchema,
      TopicId: z.string().describe('要检索分析的日志主题ID，仅能指定一个日志主题'),
    },
  },
  async ({ Text, TopicId, Region: regionFromAI }) => {
    const region = regionFromAI;
    if (!region) {
      return formatResponse(noRegionProvidedErrorMessage, true);
    }

    const cloudApiBaseHost = process.env.TENCENTCLOUD_API_BASE_HOST || 'tencentcloudapi.com';
    const clsClient = new ClsClient({
      credential: {
        secretId: process.env.TENCENTCLOUD_SECRET_ID,
        secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
      },
      region,
      profile: {
        language: 'zh-CN',
        httpProfile: {
          endpoint: `cls.${cloudApiBaseHost}`,
          reqTimeout: 300,
        },
      },
    });
    clsClient.sdkVersion = capiClientVersion;

    try {
      const response = await clsClient.request('ChatCompletions', {
        Model: 'text2sql',
        Messages: [
          {
            Content: Text,
            Role: 'user',
          },
        ],
        Metadata: [
          {
            Key: 'topic_id',
            Value: TopicId,
          },
          {
            Key: 'topic_region',
            Value: region,
          },
        ],
        Stream: false,
      });
      return formatResponse(response);
    } catch (e: any) {
      return formatResponse({ message: e?.toString ? e.toString() : e?.message, stack: e?.stack, ...e }, true);
    }
  },
);

// Common response formatting function
const formatResponse = (data: any, isError?: boolean): CallToolResult => {
  let text = '';
  try {
    text = JSON.stringify(data);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    text = String(data);
  }

  const maxLength = process.env.MAX_LENGTH ? Number(process.env.MAX_LENGTH) : null;
  if (maxLength && text.length > maxLength) {
    text = `${text.substring(0, maxLength)}...(truncated)`;
  }

  return {
    content: [
      {
        type: 'text',
        text: text || '',
      },
    ],
    isError: !!isError,
  };
};

function main() {
  const transport = process.env.TRANSPORT;
  if (transport === 'sse') {
    const app = express();
    let transport: SSEServerTransport | null = null;
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;

    app.get('/sse', (req, res) => {
      transport = new SSEServerTransport('/messages', res);
      mcpServer.connect(transport).catch((error) => {
        console.error('Fatal error in main():', error);
        process.exit(error?.code || 1);
      });
    });

    app.post('/messages', (req, res) => {
      if (transport) {
        transport.handlePostMessage(req, res);
      }
    });

    app.listen(port);

    console.log(`Started cls-mcp-server in sse transport on port ${port}.`);
  } else {
    const stdioTransport = new StdioServerTransport();
    mcpServer
      .connect(stdioTransport)
      .then(() => {
        console.log(`Started cls-mcp-server in stdio transport.`);
      })
      .catch((error) => {
        console.error('Fatal error in main():', error);
        process.exit(error?.code || 1);
      });
  }
}

main();

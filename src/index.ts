#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import 'dotenv/config';
import express from 'express';
import { cls } from 'tencentcloud-sdk-nodejs-cls';
import { SearchLogRequest } from 'tencentcloud-sdk-nodejs-cls/tencentcloud/services/cls/v20201016/cls_models.js';
import { region } from 'tencentcloud-sdk-nodejs-region';
import { z } from 'zod';

// console.log(process.env); // remove this after you've confirmed it is working

const ClsClient = cls.v20201016.Client;
const RegionClient = region.v20220627.Client;

// Initialize MCP server
const mcpServer = new McpServer({
  name: 'cls-mcp-server',
  version: '1.0.0',
});

const MultiTopicSearchInformationSchema = z.object({
  TopicId: z.string().optional().describe('要检索分析的日志主题ID'),
});
const SearchLogRequestSchema = {
  From: z
    .number()
    .describe(
      '要检索分析的日志的起始时间，Unix时间戳（需要传毫秒粒度）。To-From 时间范围建议不要过大，建议默认近15分钟，否则会导致返回的日志过多，影响性能。计算相对时间（如近15分钟）时，如果AI模型不知道当前时间，AI模型应该先调用GetCurrentTimestamp工具获取当前时间，再基于这个当前时间去计算相对时间。',
    ),
  To: z
    .number()
    .describe(
      '要检索分析的日志的结束时间，Unix时间戳（需要传毫秒粒度）。To-From 时间范围建议不要过大，建议默认近15分钟，否则会导致返回的日志过多，影响性能。计算相对时间（如近15分钟）时，如果AI模型不知道当前时间，AI模型应该先调用GetCurrentTimestamp工具获取当前时间，再基于这个当前时间去计算相对时间。',
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
  Region: z.string().describe('地域信息，必传，如：ap-guangzhou'),
};

mcpServer.tool(
  'SearchLog',
  'Search logs based on query parameters',
  SearchLogRequestSchema,
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
      const region = regionFromAI || process.env.TENCENTCLOUD_REGION;
      if (!region) {
        throw new Error('no Region is provided.');
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
      clsClient.sdkVersion = 'cls-mcp-server';

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
      return formatResponse(response.Results?.map((result) => result?.LogJson));
    } catch (e: any) {
      return formatResponse({ message: e?.toString ? e.toString() : e?.message, stack: e?.stack, ...e }, true);
    }
  },
);

mcpServer.tool(
  'GetTopicInfoByName',
  'search topic info by topic name',
  {
    searchText: z
      .string()
      .optional()
      .describe('Text to search, possible value: topic name. If not provided, will search all topics'),
    preciseSearch: z
      .boolean()
      .default(false)
      .describe('If precise search(true) or fuzzy search(false), default false. Recommend to use fuzzy search.'),
    region: z.string().describe('地域信息，必传，如：ap-guangzhou'),
  },
  async ({ region: regionFromAI, searchText, preciseSearch }) => {
    try {
      const region = regionFromAI || process.env.TENCENTCLOUD_REGION;
      if (!region) {
        throw new Error('no region provided.');
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
      clsClient.sdkVersion = 'cls-mcp-server';

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

mcpServer.tool(
  'GetRegionCodeByName',
  'search region parameter by region name',
  {
    searchText: z.string().describe('region name to search, e.g. Hong Kong or 广州'),
    language: z
      .string()
      .optional()
      .default('zh-CN')
      .describe('search text language, "zh-CN" or "en-US", default zh-CN'),
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
      regionClient.sdkVersion = 'cls-mcp-server';

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

mcpServer.tool('GetCurrentTimestamp', 'get current timestamp in milliseconds', {}, () => formatResponse(Date.now()));

mcpServer.tool(
  'TextToSearchLogQuery',
  'get cls SearchLog Query with natual language generated by user',
  {
    Text: z
      .string()
      .describe('natual language input generated by user, e.g. 查询日志条数 or Get error logs distribution over time.'),
    Region: z.string().describe('地域信息，必传，如：ap-guangzhou'),
    TopicId: z.string().optional().describe('要检索分析的日志主题ID，仅能指定一个日志主题'),
  },
  async ({ Text, TopicId, Region: regionFromAI }) => {
    const region = regionFromAI || process.env.TENCENTCLOUD_REGION;
    if (!region) {
      throw new Error('no region provided.');
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
    clsClient.sdkVersion = 'cls-mcp-server';

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

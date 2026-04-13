import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  QueryMetricRequest,
  QueryRangeMetricRequest,
} from 'tencentcloud-sdk-nodejs-cls/tencentcloud/services/cls/v20201016/cls_models.js';
import { z } from 'zod';

import { CreateClsClientFn, McpServerInstance, NO_REGION_PROVIDED_ERROR_MESSAGE, regionSchema } from '../constants';
import { formatResponse } from '../utils';

export function registerMetricTools(mcpServer: McpServerInstance, createClsClient: CreateClsClientFn): void {
  mcpServer.registerTool(
    'QueryMetric',
    {
      description:
        '针对指标主题，查询指定时刻指标的最新值（瞬时查询）。使用 PromQL 语法对指标主题中的数据进行查询。注意：若该时刻向前推5分钟内均无指标数据，则无相应查询结果。\n\n' +
        'PromQL 语法示例：\n' +
        '- 简单查询：ETLProcessingTraffic\n' +
        '- 速率计算：rate(http_requests_total[5m])\n' +
        '- 聚合查询：sum(cpu_usage) by (instance)\n' +
        '- 参考文档：https://cloud.tencent.com/document/product/614/90334',
      inputSchema: {
        Region: regionSchema,
        TopicId: z.string().describe('指标主题ID，通过 GetTopicInfoByName 工具并指定 bizType 为 1 获取指标主题 ID。'),
        Query: z
          .string()
          .describe(
            '查询语句，必须使用 PromQL 语法，如 access_evaluation_duration_bucket。' +
              '注意：本参数仅接受 PromQL，严禁传入 CQL/SQL 语法（例如 *、SELECT、WHERE 等日志检索语句），否则会报错。' +
              '参考文档：https://cloud.tencent.com/document/product/614/90334',
          ),
        Time: z
          .number()
          .optional()
          .describe(
            '查询时间，秒级 Unix 时间戳。为空时代表当前时间戳。如需指定时间，应当先调用 ConvertTimestampToTimeString 工具获取当前时间（不传 timestamp 参数即获取当前时间），基于时间字符串计算好目标时间后，再调用 ConvertTimeStringToTimestamp 工具并指定 unit 为 "seconds" 直接获取秒级时间戳传入。',
          ),
      },
    },
    async ({ Region: regionFromAI, TopicId, Query, Time }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: QueryMetricRequest = {
          TopicId,
          Query,
          ...(Time !== undefined && { Time }),
        };

        const response = await clsClient.QueryMetric(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'QueryRangeMetric',
    {
      description:
        '针对指标主题，查询指定时间范围内指标的变化趋势（范围查询）。使用 PromQL 语法对指标主题中的数据进行时序查询，返回区间内的时序数据。\n\n' +
        'step 参数建议：根据查询时间范围合理设置数据点密度\n' +
        '- 1 小时内：step=60（每分钟）\n' +
        '- 1 天内：step=300（每 5 分钟）\n' +
        '- 1 周内：step=3600（每小时）\n' +
        '- 1 月内：step=86400（每天）',
      inputSchema: {
        Region: regionSchema,
        TopicId: z.string().describe('指标主题ID，通过 GetTopicInfoByName 工具并指定 bizType 为 1 获取指标主题 ID。'),
        Query: z
          .string()
          .describe(
            '查询语句，必须使用 PromQL 语法，如 access_evaluation_duration_bucket。' +
              '注意：本参数仅接受 PromQL，严禁传入 CQL/SQL 语法（例如 *、SELECT、WHERE 等日志检索语句），否则会报错。' +
              '参考文档：https://cloud.tencent.com/document/product/614/90334',
          ),
        Start: z
          .number()
          .describe(
            '查询起始时间，秒级 Unix 时间戳。应当先调用 ConvertTimestampToTimeString 工具获取当前时间（不传 timestamp 参数即获取当前时间），基于时间字符串计算好目标时间后，再调用 ConvertTimeStringToTimestamp 工具并指定 unit 为 "seconds" 直接获取秒级时间戳传入。End减去Start的时间范围建议不要过大，建议默认近15分钟，否则会导致返回过多数据，影响性能。',
          ),
        End: z
          .number()
          .describe(
            '查询结束时间，秒级 Unix 时间戳。应当先调用 ConvertTimestampToTimeString 工具获取当前时间（不传 timestamp 参数即获取当前时间），基于时间字符串计算好目标时间后，再调用 ConvertTimeStringToTimestamp 工具并指定 unit 为 "seconds" 直接获取秒级时间戳传入。End减去Start的时间范围建议不要过大，建议默认近15分钟，否则会导致返回过多数据，影响性能。',
          ),
        Step: z.number().describe('查询时间间隔，单位秒。例如 60 表示每 60 秒一个数据点。'),
      },
    },
    async ({ Region: regionFromAI, TopicId, Query, Start, End, Step }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(NO_REGION_PROVIDED_ERROR_MESSAGE, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: QueryRangeMetricRequest = {
          TopicId,
          Query,
          Start,
          End,
          Step,
        };

        const response = await clsClient.QueryRangeMetric(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );
}

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import moment from 'moment-timezone';
import {
  DescribeIndexRequest,
  DescribeLogContextRequest,
  DescribeLogHistogramRequest,
  SearchLogRequest,
} from 'tencentcloud-sdk-nodejs-cls/tencentcloud/services/cls/v20201016/cls_models.js';
import { z } from 'zod';

import {
  CreateClsClientFn,
  McpServerInstance,
  SearchLogRequestSchema,
  SEARCH_TIME_TEXT_FORMAT,
  TIMEZONE_SHANGHAI,
  msTimestampFromDesc,
  msTimestampToDesc,
  noRegionProvidedErrorMessage,
  regionSchema,
} from '../constants';
import { formatResponse } from '../utils';

export function registerLogSearchTools(mcpServer: McpServerInstance, createClsClient: CreateClsClientFn): void {
  mcpServer.registerTool(
    'SearchLog',
    {
      description:
        '搜索CLS日志内容。在指定日志主题和时间范围内搜索日志，支持复杂查询语法和统计分析。\n\n' +
        '重要：务必先使用 TextToSearchLogQuery 工具生成 CQL 查询语句！\n' +
        'TextToSearchLogQuery 能自动适配日志主题索引配置，确保字段名称准确、语法正确。\n' +
        '警告：如果不使用 TextToSearchLogQuery 生成 CQL，直接手写很可能出现字段名称错误、语法不规范等问题导致查询失败。\n\n' +
        '与 DescribeLogHistogram 的分工：\n' +
        '- SearchLog 支持 SQL 分析（管道符 |），可实现按时间分组统计、多维聚合等复杂分析，功能更强大，优先使用\n' +
        '- DescribeLogHistogram 仅返回时间和计数两个维度，适用于不支持 SQL 分析的日志主题（如低频存储主题）\n\n' +
        '后续操作：\n' +
        '- 查看某条日志的上下文：使用返回结果中的 PkgId、PkgLogId、Time 调用 DescribeLogContext 工具\n\n' +
        'CQL（Cloud Query Language）语法说明：\n' +
        '1. 全文检索：直接输入关键词，如 error；多关键词空格分隔默认 OR 关系\n' +
        '2. 键值检索：key:value 格式，如 level:ERROR、status:404\n' +
        '3. 短语检索：双引号包裹，如 name:"john Smith"\n' +
        '4. 模糊检索：* 匹配多字符，? 匹配单字符，如 host:www.test*.com\n' +
        '5. 数值比较：支持 >、>=、<、<=、=，如 status:>400\n' +
        '6. 范围检索：使用比较运算符组合，如 status:>=400 AND status:<500\n' +
        '7. 逻辑运算符：AND、OR、NOT，支持括号组合，如 (level:ERROR OR level:WARNING) AND pid:1234\n' +
        '8. SQL 分析（管道符 |）：\n' +
        '   - 聚合统计：* | SELECT count(*) AS total\n' +
        '   - 分组统计：* | SELECT count(*) AS cnt, level GROUP BY level\n' +
        '   - 排序限制：* | SELECT count(*) AS cnt, host GROUP BY host ORDER BY cnt DESC LIMIT 10\n' +
        '   - 条件过滤：* | SELECT * WHERE response_time > 1000',
      inputSchema: SearchLogRequestSchema,
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
        const clsClient = createClsClient(region);

        const capiParams: SearchLogRequest = {
          SyntaxRule: 1,
          UseNewAnalysis: true,
          From,
          To,
          Query,
          ...(TopicId !== undefined && {
            TopicId,
          }),
          ...(Topics !== undefined && {
            Topics,
          }),
          ...(Sort !== undefined && {
            Sort,
          }),
          ...(Limit !== undefined && {
            Limit,
          }),
          ...(Offset !== undefined && {
            Offset,
          }),
          ...(SamplingRate !== undefined && {
            SamplingRate,
          }),
        };

        const response = await clsClient.SearchLog(capiParams);
        if (response.Analysis) {
          return formatResponse(response.AnalysisRecords);
        }
        return formatResponse(
          response.Results?.map((result: any) => ({
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
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'DescribeLogContext',
    {
      description:
        '获取指定日志的上下文内容（前后 N 条日志）。用于在定位到某条异常日志后，查看其前后的日志以分析问题根因。\n\n' +
        '前置条件：需先使用 SearchLog 工具检索到目标日志，从返回结果的 Results 中获取 Time、PkgId、PkgLogId 三个必填参数。',
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
          .number()
          .describe('请求包内日志的ID。通过 SearchLog 工具检索原始日志时，Results 结构体中会返回 PkgLogId 字段。'),
        PrevLogs: z.number().optional().default(10).describe('向前获取的日志条数，默认 10。'),
        NextLogs: z.number().optional().default(10).describe('向后获取的日志条数，默认 10。'),
        Query: z.string().optional().describe('检索语句，对日志上下文进行过滤，不支持SQL语句。'),
        From: z.number().optional().describe(msTimestampFromDesc.replace('。应当', '，可选。应当')),
        To: z.number().optional().describe(msTimestampToDesc.replace('。应当', '，可选。应当')),
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
        const clsClient = createClsClient(region);

        const capiParams: DescribeLogContextRequest = {
          TopicId,
          BTime: moment(Time).tz(TIMEZONE_SHANGHAI).format(SEARCH_TIME_TEXT_FORMAT),
          PkgId,
          PkgLogId,
          PrevLogs,
          NextLogs,
          From,
          To,
          ...(Query !== undefined && {
            Query,
          }),
          ...(From !== undefined && {
            From,
          }),
          ...(To !== undefined && {
            To,
          }),
        };

        const response = await clsClient.DescribeLogContext(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'TextToSearchLogQuery',
    {
      description:
        '【CQL专家】AI 智能生成 CLS CQL 查询语句。将自然语言描述转换为可直接用于 SearchLog 或 DescribeLogHistogram 的 CQL 语句。\n\n' +
        '核心优势：\n' +
        '1. 自动适配日志主题索引配置，字段名称 100% 准确\n' +
        '2. 严格遵循 CQL 语法规范，生成的语句保证可执行\n' +
        '3. 查询性能经过优化，执行效率高\n' +
        '4. 支持从简单过滤到复杂聚合的所有查询场景\n' +
        '5. 自动进行语法校验，确保语句正确性\n\n' +
        '警告：如果不使用本工具生成 CQL，直接手写一定会出现以下问题：\n' +
        '- 字段名称错误，导致查询无结果\n' +
        '- 语法不符合 CQL 规范，导致查询失败\n' +
        '- 统计逻辑错误，导致结果不符合预期\n\n' +
        '典型应用场景：\n' +
        '- 简单过滤："查询 ERROR 级别日志" → level:\'error\'\n' +
        '- 字段统计："查看 IP 分布" → * | SELECT IP, count(*) AS cnt GROUP BY IP ORDER BY cnt DESC\n' +
        '- 复杂聚合："按小时统计各状态码数量" → * | SELECT histogram(__TIMESTAMP__, INTERVAL 1 HOUR) AS hour, status_code, count(*) GROUP BY hour, status_code\n' +
        '- 多维分析："按地域和业务分组，统计错误数>100的" → level:ERROR | SELECT region, service, count(*) AS error_count GROUP BY region, service HAVING error_count > 100',
      inputSchema: {
        Text: z
          .string()
          .describe(
            '用户的自然语言查询描述，支持中文和英文。如：查询日志条数、Get error logs distribution over time。',
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

      const clsClient = createClsClient(region, { reqTimeout: 300 });

      try {
        const response = await clsClient.ChatCompletions({
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
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'DescribeIndex',
    {
      description:
        '获取 CLS 日志主题索引配置。查询指定日志主题的索引配置信息，包括键值索引、元数据索引（TAG）和全文索引的详细配置。\n' +
        '索引配置决定了日志哪些字段可以被搜索和分析，是日志检索和分析的基础配置。\n\n' +
        '使用场景：生成检索语句时，推荐优先使用 TextToSearchLogQuery 工具（自动适配索引配置）。仅在需要手写 CQL 查询时，才使用本工具了解日志主题有哪些可检索字段及其类型。\n\n' +
        '返回字段包含：字段名及其 type（类型）、sql_flag（是否支持 SQL 分析）、description（字段描述）；__TAG__（元数据索引）；__FULLTEXT__（全文索引）。',
      inputSchema: {
        Region: regionSchema,
        TopicId: z.string().describe('日志主题 ID，需要查询索引配置的日志主题标识符。'),
      },
    },
    async ({ Region: regionFromAI, TopicId }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(noRegionProvidedErrorMessage, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: DescribeIndexRequest = {
          TopicId,
        };

        const response = await clsClient.DescribeIndex(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );

  mcpServer.registerTool(
    'DescribeLogHistogram',
    {
      description:
        '获取 CLS 日志直方图数据。查询指定日志主题在指定时间范围内的日志分布直方图，统计各时间段内匹配查询条件的日志数量。\n\n' +
        '重要：本工具仅返回时间（BTime）和计数（Count）两个维度，无法做多字段聚合分析。\n' +
        '- 如果日志主题支持 SQL 分析（标准存储），应优先使用 SearchLog 工具通过管道符 | 进行时间分组统计，功能更强大\n' +
        '- 本工具适用于不支持 SQL 分析的日志主题（如低频存储主题），或只需快速查看日志量时间趋势的场景\n\n' +
        'Query 参数使用 CQL 语法，建议先使用 TextToSearchLogQuery 生成。\n\n' +
        '返回信息包含：Interval（时间间隔）、TotalCount（总日志条数）、HistogramInfos（各时间段的 BTime 起始时间和 Count 日志计数）。',
      inputSchema: {
        Region: regionSchema,
        TopicId: z.string().describe('日志主题 ID，需要查询直方图的日志主题标识符。'),
        From: z.number().describe(msTimestampFromDesc),
        To: z.number().describe(msTimestampToDesc),
        Query: z.string().describe('CQL 查询语句，用于过滤日志。使用 * 查询所有日志。'),
        Interval: z
          .number()
          .optional()
          .describe(
            '统计时间间隔，单位毫秒。常用值：60000（1分钟）、300000（5分钟）、600000（10分钟）。不传则系统自动计算。',
          ),
      },
    },
    async ({ Region: regionFromAI, TopicId, From, To, Query, Interval }): Promise<CallToolResult> => {
      try {
        const region = regionFromAI;
        if (!region) {
          return formatResponse(noRegionProvidedErrorMessage, true);
        }
        const clsClient = createClsClient(region);

        const capiParams: DescribeLogHistogramRequest = {
          TopicId,
          From,
          To,
          Query,
          SyntaxRule: 1,
          ...(Interval !== undefined && { Interval }),
        };

        const response = await clsClient.DescribeLogHistogram(capiParams);
        return formatResponse(response);
      } catch (e: any) {
        return formatResponse({ message: String(e), stack: e?.stack, ...e }, true);
      }
    },
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { cls } from 'tencentcloud-sdk-nodejs-cls';
import { z } from 'zod';

export const CAPI_CLIENT_VERSION = `cls-mcp-server-${process.env.CLS_MCP_SERVER_VERSION}`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ClsClient = cls.v20201016.Client;

export const regionSchema = z.string().describe('地域信息，必选，如：ap-guangzhou。');
export const NO_REGION_PROVIDED_ERROR_MESSAGE =
  '未提供 Region 参数。请先向用户确认地域信息（如 ap-guangzhou），然后将 Region 参数传入工具。可使用 GetRegionCodeByName 工具通过地域名称查询地域代码。';

export const filtersSchema = z
  .array(
    z.object({
      Key: z.string().describe('过滤条件的键'),
      Values: z.array(z.string()).describe('过滤条件的值列表'),
    }),
  )
  .optional()
  .describe('过滤条件列表，每个过滤条件包含 Key 和 Values 字段。');

export const paginationSchema = {
  Offset: z.number().optional().default(0).describe('分页偏移量，从 0 开始，默认为 0'),
  Limit: z.number().optional().default(20).describe('单页返回的数量，最大 100，默认 20'),
};

export const MS_TIMESTAMP_FROM_DESC =
  '查询起始时间，Unix时间戳（毫秒单位）。应当先调用 ConvertTimestampToTimeString 工具获取当前时间(不传timestamp参数就是获取当前时间)，基于时间字符串计算好From、To参数后，再调用 ConvertTimeStringToTimestamp 工具获取时间戳。To减去From的时间范围建议不要过大，建议默认近15分钟，否则会导致返回的数据过多，影响性能。';
export const MS_TIMESTAMP_TO_DESC =
  '查询结束时间，Unix时间戳（毫秒单位）。应当先调用 ConvertTimestampToTimeString 工具获取当前时间(不传timestamp参数就是获取当前时间)，基于时间字符串计算好From、To参数后，再调用 ConvertTimeStringToTimestamp 工具获取时间戳。To减去From的时间范围建议不要过大，建议默认近15分钟，否则会导致返回的数据过多，影响性能。';

const MultiTopicSearchInformationSchema = z.object({
  TopicId: z.string().optional().describe('要检索分析的日志主题ID'),
});
export const SearchLogRequestSchema = {
  From: z.number().describe(MS_TIMESTAMP_FROM_DESC),
  To: z.number().describe(MS_TIMESTAMP_TO_DESC),
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
  Limit: z.number().optional().default(10).describe('单次查询返回的日志条数，默认为10，最大值为1000'),
  Offset: z.number().optional().default(0).describe('查询原始日志的偏移量，表示从第几行开始返回原始日志，默认为0'),
  SamplingRate: z
    .number()
    .optional()
    .default(1)
    .describe('执行统计分析时是否对原始日志先进行采样，0：自动采样；0～1：按指定采样率采样；1：不采样'),
  Region: regionSchema,
};

export const TIMEZONE_SHANGHAI = 'Asia/Shanghai';
export const SEARCH_TIME_TEXT_FORMAT = 'YYYY-MM-DD HH:mm:ss.SSS';
export const ISO_8601_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss.sssZ';

export const SYSTEM_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const DEFAULT_TIME_ZONE = process.env.TZ || SYSTEM_TIME_ZONE || TIMEZONE_SHANGHAI;

/** Type for the createClsClient factory function used by all tool registration functions */
export type CreateClsClientFn = (
  regionValue: string,
  options?: { reqTimeout?: number },
) => InstanceType<typeof ClsClient>;

/** Type alias for McpServer used across tool registration functions */
export type McpServerInstance = InstanceType<typeof McpServer>;

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { cls } from 'tencentcloud-sdk-nodejs-cls';
import { region } from 'tencentcloud-sdk-nodejs-region';

import { CAPI_CLIENT_VERSION } from './constants';

export const ClsClient = cls.v20201016.Client;
export const RegionClient = region.v20220627.Client;

/** Common response formatting function */
export const formatResponse = (data: any, isError?: boolean): CallToolResult => {
  let text: string;
  if (typeof data === 'string') {
    // 已经是字符串（如 Markdown）直接透传，避免被再次 JSON.stringify 导致引号和 \n 被转义
    text = data;
  } else {
    try {
      text = JSON.stringify(data) ?? String(data);
    } catch {
      text = String(data);
    }
  }

  const maxLength = process.env.MAX_LENGTH ? Number(process.env.MAX_LENGTH) : undefined;
  if (maxLength && text.length > maxLength) {
    text = `${text.substring(0, maxLength)}...(truncated)`;
  }

  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    isError: !!isError,
  };
};

/** Factory function to create a CLS API client for a given region */
export function createClsClient(
  regionValue: string,
  options?: { reqTimeout?: number },
): InstanceType<typeof ClsClient> {
  const cloudApiBaseHost = process.env.TENCENTCLOUD_API_BASE_HOST || 'tencentcloudapi.com';
  const client = new ClsClient({
    credential: {
      secretId: process.env.TENCENTCLOUD_SECRET_ID,
      secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
    },
    region: regionValue,
    profile: {
      language: 'zh-CN',
      httpProfile: {
        endpoint: `cls.${cloudApiBaseHost}`,
        ...(options?.reqTimeout && { reqTimeout: options.reqTimeout }),
      },
    },
  });
  client.sdkVersion = CAPI_CLIENT_VERSION;
  return client;
}

/**
 * 创建 Region 子产品客户端,用于查询腾讯云地域代码与展示名映射。
 * 与 GetRegionCodeByName 工具共享同一份配置。
 */
export function createRegionClient(language: 'zh-CN' | 'en-US' = 'zh-CN'): InstanceType<typeof RegionClient> {
  const cloudApiBaseHost = process.env.TENCENTCLOUD_API_BASE_HOST || 'tencentcloudapi.com';
  const client = new RegionClient({
    credential: {
      secretId: process.env.TENCENTCLOUD_SECRET_ID,
      secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
    },
    region: process.env.TENCENTCLOUD_REGION || 'ap-guangzhou',
    profile: {
      language,
      httpProfile: {
        endpoint: `region.${cloudApiBaseHost}`,
      },
    },
  });
  client.sdkVersion = CAPI_CLIENT_VERSION;
  return client;
}

export type RegionItem = { Region: string; RegionName: string };

/**
 * 拉取 CLS 产品的地域列表。
 * 不做模块级缓存:地域信息虽然几乎不变,但保持每次都向云 API 实时查询可以:
 *   - 保证新增/调整的地域立即可见
 *   - 让运维侧可观察 DescribeRegions 的实时健康状况
 *   - 避免缓存与并发去重逻辑带来的隐式行为
 *
 * 失败时输出 warn 便于排障,并返回空数组让上层降级到原始 region 字符串。
 */
export async function fetchClsRegionList(language: 'zh-CN' | 'en-US' = 'zh-CN'): Promise<RegionItem[]> {
  try {
    const client = createRegionClient(language);
    const resp = await client.DescribeRegions({ Product: 'cls' });
    return ((resp?.RegionSet as RegionItem[]) || []).map((r) => ({
      Region: r.Region,
      RegionName: r.RegionName,
    }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[fetchClsRegionList] DescribeRegions failed:', (err as any)?.message || err);
    return [];
  }
}

/**
 * 把 DescribeRegions 返回的 RegionName 抽出"括号内的主名"。
 * 同时支持半角 `()`、全角 `（）`,以及 zh / en 双语场景。
 * - "华南地区(广州)" → "广州"
 * - "华南地区（广州）" → "广州"(全角)
 * - "亚太东北 (东京)" → "东京"(中文 + 空格 + 半角)
 * - "Asia Pacific Northeast(Tokyo)" → "Tokyo"
 * - 没有括号时退回原值
 */
export function extractRegionMainName(regionName: string | undefined): string {
  if (!regionName) return '';
  // 半角或全角括号都支持。把全角统一成半角后用同一个正则
  const normalized = regionName.replace(/（/g, '(').replace(/）/g, ')');
  const m = /\(([^)]+)\)/.exec(normalized);
  if (m?.[1]) return m[1].trim();
  return regionName;
}

/**
 * 通过地域代码(如 ap-guangzhou)查询展示名(如 "广州")。
 * - 复用 GetRegionCodeByName 同一份接口数据,不维护内置硬编码 map
 * - 接口失败时直接返回原始代码,保证调用方流程不阻塞
 * - 用法:`const display = await getRegionDisplayName('ap-tokyo');` → "东京"
 */
export async function getRegionDisplayName(
  regionCode: string | undefined,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): Promise<string> {
  if (!regionCode) return '';
  const list = await fetchClsRegionList(language);
  const code = regionCode.toLowerCase();
  const hit = list.find((r) => r.Region?.toLowerCase() === code);
  if (!hit) return regionCode;
  return extractRegionMainName(hit.RegionName) || hit.RegionName || regionCode;
}

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { cls } from 'tencentcloud-sdk-nodejs-cls';
import { region } from 'tencentcloud-sdk-nodejs-region';

import { CAPI_CLIENT_VERSION } from './constants';

export const ClsClient = cls.v20201016.Client;
export const RegionClient = region.v20220627.Client;

/** Common response formatting function */
export const formatResponse = (data: any, isError?: boolean): CallToolResult => {
  let text: string;
  try {
    text = JSON.stringify(data) ?? String(data);
  } catch {
    text = String(data);
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

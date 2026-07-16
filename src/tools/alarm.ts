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
import { formatResponse, getRegionDisplayName } from '../utils';

// ==================== Helper functions for GetAlarmDetail ====================

/**
 * 检查 URL 是否在允许的域名列表中。
 *
 * 注意：必须基于解析后的 hostname 做精确 / 正则匹配，不能对原始 URL 字符串做
 * includes / startsWith 等模糊匹配，否则攻击者可将合法域名放入 URL 的 path /
 * query / userinfo 等位置绕过校验（SSRF）。
 */
function isAllowedAlarmUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // 仅允许 https,防止降级到 http 后被中间人或内网明文服务利用
  if (parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return (
    hostname === 'alarm.cls.tencentcs.com' ||
    hostname === 'mc.tencent.com' ||
    // 长链格式 host: {region}-monitor.cls.tencentcs.com 或 {region}-open-monitor.cls.tencentcs.com
    /^[a-z0-9][a-z0-9-]*-monitor\.cls\.tencentcs\.com$/.test(hostname)
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
 * 解析告警 URL,获取最终可解析的长链。
 * 如果 URL 已包含 RecordId（长链）,直接返回,无需发起网络请求。
 * 仅当 URL 为短链（不含 RecordId）时才 fetch 跟踪重定向。
 * 这样兼容客户环境无法访问公网的场景。
 *
 * 注意：重定向得到的 location 必须重新走白名单校验,否则短链服务若被劫持/
 * 返回任意 Location,会导致调用方被动发起 SSRF。
 */
async function resolveRedirectUrl(url: string): Promise<string> {
  // 长链已包含 RecordId,无需网络请求
  if (tryExtractRecordId(url)) {
    return url;
  }

  // 短链需要 fetch 获取重定向目标
  const response = await fetch(url, { redirect: 'manual' });
  if (response.status === 301 || response.status === 302) {
    const location = response.headers.get('location');
    if (location) {
      // 相对重定向：以原 URL 为 base 补全
      let resolvedLocation: string;
      try {
        resolvedLocation = new URL(location, url).toString();
      } catch {
        throw new Error('告警短链返回的重定向地址无效。');
      }
      // 重定向目标必须仍在白名单内,防止二次跳转绕过
      if (!isAllowedAlarmUrl(resolvedLocation)) {
        throw new Error('告警短链重定向到了不允许的地址。');
      }
      return resolvedLocation;
    }
  }
  // 不是重定向,返回原 URL
  return url;
}

/**
 * 从长链 URL 解析出 host 和 RecordId
 */
function parseAlarmDetailUrl(longUrl: string): { host: string; recordId: string; region: string } {
  // 长链格式: https://{region}-monitor.cls.tencentcs.com/cls_no_login?action=GetAlertDetailPage#/alert?RecordId=xxx
  const parsed = new URL(longUrl);
  const host = parsed.hostname;

  // 从 host 提取 region: {region}-monitor.cls.tencentcs.com → {region}
  // 该 region 会作为云 API 的 X-TC-Region 使用,必须与 host 保持一致,不可做任何剥离/改写。
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
 * 从对象中按候选 key 列表取第一个非空值（兼容多种字段命名风格）
 */
function pickField(record: any, keys: string[]): any {
  for (const k of keys) {
    const v = record?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * 在多个候选对象中按字段名查找第一个非空值。
 * RecordLog 同名字段可能出现在 record 顶层 / record.ResultsSnapshot / record.AlertSnapshot.AlertInfo,
 * 用此函数透明地从多层结构里取值。
 */
function pickFromObjects(objects: any[], keys: string[]): any {
  for (const obj of objects) {
    if (!obj) continue;
    const v = pickField(obj, keys);
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * 从告警历史链接中解析 region 参数(?region=ap-xxx)。同时支持:
 *   - 普通 querystring: `https://x/y?region=ap-xxx`
 *   - SPA 路由 hash 后置 querystring: `https://x/y#/?region=ap-xxx`
 *
 * 前端展示地域优先用 region 代码,因为 ResultsSnapshot.Region 已是本地化字符串,
 * 不易再反向消歧(例如同一区域有 "open 版" 时无法精确区分)。
 */
function extractRegionFromAlertHistoryUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const fromQuery = u.searchParams.get('region');
    if (fromQuery) return fromQuery;
    // 兼容 SPA 路由把 query 放在 hash 后(如 #/path?region=xxx)
    const hash = u.hash || '';
    const hashQueryStart = hash.indexOf('?');
    if (hashQueryStart >= 0) {
      const params = new URLSearchParams(hash.slice(hashQueryStart + 1));
      const fromHash = params.get('region');
      if (fromHash) return fromHash;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * 容错地把任意值转换为有限数字。无法转换或非有限值时返回 undefined,
 * 这样调用方可以用 `if (n !== undefined && n > 0)` 的方式做判断,
 * 同时兼容后端把数字字段序列化为字符串的场景(如 `"5"` / `"12"`)。
 */
function toFiniteNumber(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 把任意单元格值转成可安全嵌入 Markdown 表格的字符串。
 * - 把 `|` 转义成 `\|`(否则会被当作列分隔符)
 * - 把 `\n` / `\r` 替换成 `<br>`(否则会终止当前行,后续 `|` 被当作正文)
 * - 把 `\\` 转义,防止与 `\|` 串扰
 * 适用于 query 分析表格 与 RawResults 表格的 cell / header 输出。
 */
function escapeMarkdownTableCell(v: any): string {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'string' ? v : String(v);
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/**
 * 把告警等级映射成可读文案。
 * - 数字 0/1/2 来自 AlarmLevel:  0:警告(Warn)、1:提醒(Info)、2:紧急(Critical)
 * - 字符串 'Warn'/'Info'/'Critical' 来自 ResultsSnapshot.Level
 * - 中文 '警告' 等来自 ResultsSnapshot.level_zh
 * 优先输出可读形式,其它情况原样返回。
 */
function formatAlarmLevel(level: any): string {
  if (level === undefined || level === null || level === '') return '未知';
  // 数字 0/1/2
  if (typeof level === 'number' || /^\d+$/.test(String(level))) {
    const map: Record<string, string> = {
      '0': '警告 (Warn)',
      '1': '提醒 (Info)',
      '2': '紧急 (Critical)',
    };
    return map[String(level)] || String(level);
  }
  // 英文枚举
  const en2zh: Record<string, string> = {
    Warn: '警告 (Warn)',
    Info: '提醒 (Info)',
    Critical: '紧急 (Critical)',
  };
  const s = String(level);
  return en2zh[s] || s;
}

/**
 * 告警状态枚举(RecordLog.Status)。
 *
 * 取值定义(与告警详情页展示保持一致):
 *   0 = 未恢复 / 触发中
 *   1 = 已恢复
 *   2 = 已失效
 *   3 = 处理中(已认领)
 *
 * ⚠️ 不要把这里的 Status 与 RecordLog.ResultsSnapshot.NotifyType(取值 1/2/3/4 的
 * 事件类型字段)混淆,见 formatNotifyType 注释。
 */
function formatAlarmStatus(status: any): string {
  if (status === undefined || status === null || status === '') return '未知';
  const n = Number(status);
  const map: Record<number, string> = {
    0: '未恢复（触发中）',
    1: '已恢复',
    2: '已失效',
    3: '处理中（已认领）',
  };
  return map[n] || String(status);
}

/**
 * ResultsSnapshot.NotifyType —— 当前告警事件的类型。
 *
 * ⚠️ 这是**事件层**字段,与告警策略配置中的"通知偏好"(取值 0/1/2/3 表示
 * 空/仅触发/仅恢复/全部)不是同一个字段,不要混淆。事件层取值:
 *   1 = 告警触发
 *   2 = 告警恢复
 *   3 = 屏蔽变更通知
 *   4 = 告警认领通知
 */
function formatNotifyType(t: any): string {
  if (t === undefined || t === null || t === '') return '';
  const n = Number(t);
  const map: Record<number, string> = {
    1: '告警触发',
    2: '告警恢复',
    3: '屏蔽变更通知',
    4: '告警认领通知',
  };
  return map[n] || String(t);
}

/**
 * 把毫秒时间戳格式化成本地可读时间字符串。
 * - 数字/数字字符串:  13 位毫秒时间戳 → "yyyy/m/d HH:MM:SS (raw)"
 * - 字符串日期(如 "2026-05-14 16:11:16"):  原样返回
 * - 0/空:  返回空字符串
 */
function formatTimestamp(value: any): string {
  if (value === undefined || value === null || value === '') return '';
  // 字符串但不是纯数字:  视为已格式化的日期,直接返回
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    return value;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num === 0) return '';
  if (num > 1e12 && num < 1e14) {
    const d = new Date(num);
    if (!Number.isNaN(d.getTime())) {
      return `${d.toLocaleString('zh-CN', { hour12: false })} (${num})`;
    }
  }
  return String(value);
}

/**
 * 格式化告警详情为 Markdown（适配 DescribeAlarmDetail API 返回的 RecordLog JSON 结构）
 *
 * 设计:
 * - 这是一个**纯渲染**函数,无任何 I/O,不发起网络请求,易测试。
 * - 调用方负责把"地域代码 → 展示名"的反查结果通过 `regionDisplay` 传入,以解耦
 *   I/O 行为(参见 GetAlarmDetail 工具调用处的 `getRegionDisplayName` 调用)。
 *
 * RecordLog 真实结构（重要字段大多嵌套在 ResultsSnapshot 与 AlertSnapshot.AlertInfo 中）:
 *   {
 *     RecordId, AlertId, AlertName, TopicId, TopicName, Status,
 *     CreateTime, RecoverTime,
 *     ResultsSnapshot: {
 *       Level, level_zh, LogsetId, LogsetName, Region,
 *       StartTime, StartTimeUnix, FireTime, NotifyTime,
 *       Trigger, TriggerParams, Condition, Query, CustomizeMessage,
 *       NotifyType, NotifyTempInfo, ActualCallback, ActualReceivers,
 *       AnalysisInfo, AnalysisResultFormat, RawResults,
 *       DetailUrl, QueryUrl, ClaimUrl, SilentUrl, AlertHistoryUrl,
 *       PlatForm, ConsecutiveAlertNums, HappenThreshold, AlertThreshold,
 *       ...
 *     },
 *     AlertSnapshot: {
 *       AlertInfo: { AlarmLevel, Interval, HappenThreshold, MultiConditions, ... }
 *     }
 *   }
 */
function formatAlarmDetail(record: any, regionDisplay?: string): string {
  const parts: string[] = [];
  const snapshot = record?.ResultsSnapshot || {};
  const alertInfo = record?.AlertSnapshot?.AlertInfo || {};
  // 多数字段优先从 record 顶层 → ResultsSnapshot → AlertInfo 三层中找
  const layers = [record, snapshot, alertInfo];

  // ============ 1. 告警基本信息 ============
  const alertName = pickFromObjects(layers, ['AlertName', 'AlarmName', 'Alarm', 'Name']);
  const alertId = pickFromObjects(layers, ['AlertId', 'AlertID', 'AlarmId', 'AlarmID']);
  // 告警等级:  优先中文 level_zh,然后英文 Level,最后数字 AlarmLevel
  const levelRaw = pickFromObjects(layers, ['level_zh', 'Level', 'AlarmLevel']);
  // ⚠️ 告警记录状态只能从 record 顶层取(Record.Status):  0/1/2/3
  // 不要 fallback 到 AlertSnapshot.AlertInfo.Status —— 那是告警策略的启用状态,语义不同。
  const status = record?.Status;
  const platform = snapshot.PlatForm;

  parts.push('### ⚠️ 1.告警基本信息');
  parts.push(`- 告警名称: ${alertName || '未知'}`);
  parts.push(`- 告警ID: ${alertId || '未知'}`);
  parts.push(`- 告警等级: ${formatAlarmLevel(levelRaw)}`);
  parts.push(`- 告警状态: ${formatAlarmStatus(status)}`);
  if (platform) parts.push(`- 平台: ${platform}`);
  parts.push(`- 地域: ${regionDisplay || '未知'}`);

  // ============ 2. 监控对象 ============
  const topicName = pickFromObjects(layers, ['TopicName']);
  const topicId = pickFromObjects(layers, ['TopicId', 'MonitoredObject']);
  const logsetName = snapshot.LogsetName || snapshot.UserLogsetName;
  const logsetId = snapshot.LogsetId || snapshot.UserLogsetId;

  parts.push('\n### 🎯 2.监控对象');
  if (topicName || topicId) {
    parts.push(`- 日志主题: ${topicName || ''}${topicId ? ` (${topicId})` : ''}`);
  } else {
    parts.push('- 日志主题: 未知');
  }
  if (logsetName || logsetId) {
    parts.push(`- 日志集: ${logsetName || ''}${logsetId ? ` (${logsetId})` : ''}`);
  }

  // ============ 3. 时间信息 ============
  // 注意:  ResultsSnapshot.StartTime 是格式化好的字符串("2026-05-14 16:11:16"),
  // 优先用它;Unix 毫秒时间戳作为兜底。record.CreateTime 是"记录"创建时间,通常 ≈ 触发时间但语义不同。
  const startTime =
    snapshot.StartTime || snapshot.StartTimeUnix || snapshot.FireTime || record?.StartTime || record?.CreateTime;
  const notifyTime = pickFromObjects(layers, ['NotifyTime']);
  const recoverTime = record?.RecoverTime ?? record?.RecoveryTime;
  const createTime = record?.CreateTime;
  // ResultsSnapshot.Duration 是当前已持续的分钟数,告警详情页用它显示"已经持续N分钟"
  const duration = snapshot.Duration;
  // FireTime 同时可能是字符串日期或毫秒戳,formatTimestamp 都能正确处理
  const fireTime = snapshot.FireTime;

  parts.push('\n### ⏱ 3.时间信息');
  if (startTime) parts.push(`- 首次触发时间: ${formatTimestamp(startTime)}`);
  // 仅当 FireTime 与 StartTime 明显不同时才再输出一行(避免与"首次触发时间"完全重复)。
  // - 字符串日期与毫秒戳直接 !== 总为 true,所以同时比较两端的数值化结果。
  // - StartTimeUnix 缺失时 Number(undefined)=NaN,任何 number !== NaN 永真,因此引入额外的有限性判断。
  const fireNum = toFiniteNumber(fireTime);
  const startUnixNum = toFiniteNumber(snapshot.StartTimeUnix);
  if (
    fireTime !== undefined &&
    fireTime !== null &&
    fireTime !== '' &&
    fireTime !== startTime &&
    !(fireNum !== undefined && startUnixNum !== undefined && fireNum === startUnixNum)
  ) {
    parts.push(`- 最近触发时间: ${formatTimestamp(fireTime)}`);
  }
  // 记录创建时间仅在与已显示的"首次触发时间/StartTimeUnix"在数值上不一致时才输出,避免重复。
  const createNum = toFiniteNumber(createTime);
  const startNum = toFiniteNumber(startTime);
  const shouldShowCreate =
    createNum !== undefined &&
    (startUnixNum === undefined || createNum !== startUnixNum) &&
    (startNum === undefined || createNum !== startNum);
  if (shouldShowCreate) {
    parts.push(`- 记录创建时间: ${formatTimestamp(createTime)}`);
  }
  if (notifyTime) parts.push(`- 通知时间: ${formatTimestamp(notifyTime)}`);
  const durationNum = toFiniteNumber(duration);
  if (durationNum !== undefined && durationNum > 0) {
    parts.push(`- 持续时间: 已经持续 ${durationNum} 分钟`);
  }
  // 仅在确实有恢复时间(>0)时才展示;未恢复状态已经在第 1 段显示,这里不重复输出"尚未恢复"
  const recoverNum = toFiniteNumber(recoverTime);
  if (recoverNum !== undefined && recoverNum > 0) {
    parts.push(`- 恢复时间: ${formatTimestamp(recoverNum)}`);
  }

  // ============ 4. 触发条件 ============
  const trigger = pickFromObjects(layers, ['Trigger']);
  const triggerParams = pickFromObjects(layers, ['TriggerParams']);
  const condition = pickFromObjects(layers, ['Condition']);
  // 执行周期: Interval(每 N 分钟) / At(每天 HH:mm) / CronExpression(cron),三选一,优先级遵循前端顺序。
  // Interval 兼容数字与字符串数字两种序列化形式。
  const intervalNum = toFiniteNumber(alertInfo.Interval);
  const at = typeof alertInfo.At === 'string' ? alertInfo.At : '';
  const cronExpression = typeof alertInfo.CronExpression === 'string' ? alertInfo.CronExpression : '';
  const happenThreshold = pickFromObjects([alertInfo, snapshot], ['HappenThreshold']);
  const consecutive = snapshot.ConsecutiveAlertNums;
  const multiConditions = alertInfo.MultiConditions;

  parts.push('\n### 🔍 4.触发条件');
  if (trigger) parts.push(`- 触发条件: ${trigger}`);
  if (condition && condition !== trigger) parts.push(`- 告警条件: ${condition}`);
  if (triggerParams) parts.push(`- 当前数据: ${triggerParams}`);
  if (intervalNum !== undefined && intervalNum > 0) {
    parts.push(`- 执行周期: 每 ${intervalNum} 分钟执行一次`);
  } else if (at.length > 0) {
    parts.push(`- 执行周期: 每天 ${at} 执行一次`);
  } else if (cronExpression.length > 0) {
    parts.push(`- 执行周期: ${cronExpression} (Cron)`);
  }
  if (happenThreshold !== undefined && happenThreshold !== null && happenThreshold !== '') {
    parts.push(`- 告警频率: 持续 ${happenThreshold} 个监控周期满足触发条件`);
  }
  if (consecutive !== undefined && consecutive !== null && consecutive !== '' && consecutive !== happenThreshold) {
    parts.push(`- 连续告警次数: ${consecutive}`);
  }
  if (Array.isArray(multiConditions) && multiConditions.length > 1) {
    parts.push('- 多触发条件:');
    for (const mc of multiConditions) {
      parts.push(`  - [${formatAlarmLevel(mc.AlarmLevel)}] ${mc.Trigger || ''}`);
    }
  }

  // ============ 5. 触发语句 ============
  const query = pickFromObjects(layers, ['Query']);
  if (query) {
    parts.push('\n### 📝 5.触发语句');
    parts.push(`- CQL查询语句: \`${query}\``);
    // QueryParams 里有 StartTime/EndTime 等查询时间窗
    const queryParams = snapshot.QueryParams;
    if (Array.isArray(queryParams) && queryParams.length > 0) {
      const qp = queryParams[0];
      if (qp?.StartTime && qp?.EndTime) {
        parts.push(`- 查询时间范围: ${formatTimestamp(qp.StartTime)} ~ ${formatTimestamp(qp.EndTime)}`);
      }
      if (qp?.grammarVersion) parts.push(`- 语法版本: ${qp.grammarVersion}`);
    }
  }

  // ============ 6. 通知内容 ============
  const customizeMessage = pickFromObjects(layers, ['CustomizeMessage', 'Message']);
  const notifyType = snapshot.NotifyType;
  const notifyTempInfo = snapshot.NotifyTempInfo;
  const actualCallback = snapshot.ActualCallback;
  const actualReceivers = snapshot.ActualReceivers;

  const hasNotifySection =
    customizeMessage ||
    notifyType !== undefined ||
    (Array.isArray(notifyTempInfo) && notifyTempInfo.length > 0) ||
    (Array.isArray(actualCallback) && actualCallback.length > 0) ||
    (Array.isArray(actualReceivers) && actualReceivers.length > 0);

  if (hasNotifySection) {
    parts.push('\n### 📢 6.通知配置');
    if (notifyType !== undefined && notifyType !== null && notifyType !== '') {
      const ntStr = formatNotifyType(notifyType);
      if (ntStr) parts.push(`- 通知类型: ${ntStr}`);
    }
    if (Array.isArray(notifyTempInfo) && notifyTempInfo.length > 0) {
      const tpls = notifyTempInfo.map((t: any) => `${t.TempName || ''}${t.TempID ? ` (${t.TempID})` : ''}`).join(', ');
      parts.push(`- 通知模板: ${tpls}`);
    }
    if (Array.isArray(actualReceivers) && actualReceivers.length > 0) {
      parts.push(`- 接收人: ${actualReceivers.join(', ')}`);
    }
    if (Array.isArray(actualCallback) && actualCallback.length > 0) {
      const cbs = actualCallback.filter((cb: any) => cb?.URL).map((cb: any) => cb.URL);
      if (cbs.length > 0) parts.push(`- 回调 Webhook: ${cbs.join(', ')}`);
    }
    if (customizeMessage) parts.push(`- 自定义消息: ${customizeMessage}`);
  }

  // ============ 7. 多维分析结果 ============
  const analysisInfos = snapshot.AnalysisInfo || record?.AnalysisInfo || [];
  if (Array.isArray(analysisInfos) && analysisInfos.length > 0) {
    parts.push('\n### 📊 7.多维分析结果');
    for (const analysis of analysisInfos) {
      parts.push(`\n#### 🔹 ${analysis.Name || '分析'} (Type: ${analysis.Type || '未知'})`);
      if (analysis.ErrorMsg) parts.push(`- ⚠️ 错误: ${analysis.ErrorMsg}`);

      if (analysis.Type === 'field' && analysis.FieldValueRatioInfos?.length) {
        parts.push('| 值 | 出现次数 | 百分比 |');
        parts.push('| --- | --- | --- |');
        for (const item of analysis.FieldValueRatioInfos) {
          parts.push(`| ${item.Value || ''} | ${item.Count || 0} | ${item.Ratio || '0%'} |`);
        }
      } else if (analysis.Type === 'query' && analysis.AnalysisResults?.length) {
        // AnalysisResults 实际可能是两种结构:
        //   1) [{ Data: [{Key:"col1", Value:"v1"}, {Key:"col2", Value:"v2"}] }, ...]
        //   2) [{ col1:"v1", col2:"v2" }, ...]
        // 早期实现只处理 (2),遇到 (1) 时 Object.keys(row)=["Data"],而 row["Data"] 是
        // 数组对象,会被 toString 渲染成 "[object Object]" 这种无意义文本。
        // 这里把 (1) 形态先扁平成普通对象,再统一生成表格。
        const flatten = (row: any): Record<string, any> => {
          if (row && Array.isArray(row.Data)) {
            const out: Record<string, any> = {};
            for (const kv of row.Data) {
              if (kv && kv.Key !== undefined) out[String(kv.Key)] = kv.Value;
            }
            return out;
          }
          return row || {};
        };
        const rows = analysis.AnalysisResults.map(flatten);
        // 用所有行字段并集作为列,避免不同行字段顺序不同导致缺列
        const keySet = new Set<string>();
        for (const r of rows) {
          for (const k of Object.keys(r)) keySet.add(k);
        }
        const keys = Array.from(keySet);
        if (keys.length > 0) {
          parts.push(`| ${keys.map((k) => escapeMarkdownTableCell(k)).join(' | ')} |`);
          parts.push(`| ${keys.map(() => '---').join(' | ')} |`);
          for (const row of rows) {
            parts.push(`| ${keys.map((k) => escapeMarkdownTableCell(row[k])).join(' | ')} |`);
          }
        }
      } else if (analysis.Type === 'original' && analysis.AnalysisOriginal?.length) {
        // ConfigInfo 中可能携带 Fields(列过滤,逗号分隔的字段名顺序),前端按这个顺序展示;
        // "*" 或缺省表示展示全部字段。
        let fieldsFilter: string[] | null = null;
        if (Array.isArray(analysis.ConfigInfo)) {
          const fieldsItem = analysis.ConfigInfo.find((c: any) => c?.Key === 'Fields');
          const fieldsRaw = fieldsItem?.Value;
          if (typeof fieldsRaw === 'string' && fieldsRaw.length > 0 && fieldsRaw !== '*') {
            const tokens = fieldsRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            // 注意:`tokens` 可能是空数组(例如 Fields="," / "  ")。空数组在 JS 里是 truthy,
            // 直接当过滤条件会让所有字段被静默隐藏 → 这里要求至少有 1 个 token 才生效。
            if (tokens.length > 0) fieldsFilter = tokens;
          }
        }
        // 原始日志样例:  字段较多,逐字段单独成行,可读性更好
        for (const item of analysis.AnalysisOriginal) {
          const obj = item || {};
          const entries: Array<[string, any]> = fieldsFilter
            ? fieldsFilter.map((k) => [k, obj[k]])
            : Object.entries(obj);
          for (const [k, v] of entries) {
            if (v === undefined) continue;
            const vs = String(v);
            // 超长字段(URL/堆栈/日志路径等)截断,保持输出整洁
            parts.push(`- ${k}: ${vs.length > 300 ? `${vs.slice(0, 300)}...(truncated)` : vs}`);
          }
        }
      }
    }
  }

  // ============ 8. 当前数据(原始查询结果) ============
  // 前端把 ResultsSnapshot.RawResults 搭配 ResultsSnapshot.ColNames 在告警卡片顶部以表格形式
  // 展示"当前数据"。这里改成 Markdown 表格输出,与控制台告警详情保持一致。
  // RawResults: Record<string, any>[][]   外层每个元素对应一组 Query(多语句告警)
  // ColNames:   string[][]                外层下标与 RawResults 一一对应
  const rawResults = snapshot?.RawResults || record?.RawResults;
  const colNamesAll = snapshot?.ColNames || record?.ColNames;
  if (Array.isArray(rawResults) && rawResults.length > 0) {
    parts.push('\n### 📈 8.查询结果');
    rawResults.forEach((resultSet: any, idx: number) => {
      if (!Array.isArray(resultSet) || resultSet.length === 0) return;
      // 优先用 ColNames[idx] 给定的列顺序,缺失时用第一行字段并集兜底
      let cols: string[] = [];
      if (Array.isArray(colNamesAll) && Array.isArray(colNamesAll[idx])) {
        cols = colNamesAll[idx].map((c: any) => String(c));
      }
      if (cols.length === 0) {
        const keySet = new Set<string>();
        for (const row of resultSet) {
          for (const k of Object.keys(row || {})) keySet.add(k);
        }
        cols = Array.from(keySet);
      }
      if (cols.length === 0) return;
      if (rawResults.length > 1) parts.push(`\n#### Query ${idx + 1}`);
      parts.push(`| ${cols.map((c) => escapeMarkdownTableCell(c)).join(' | ')} |`);
      parts.push(`| ${cols.map(() => '---').join(' | ')} |`);
      for (const row of resultSet) {
        parts.push(`| ${cols.map((k) => escapeMarkdownTableCell((row as any)?.[k])).join(' | ')} |`);
      }
    });
  }

  // ============ 9. 相关链接 ============
  const links: Array<[string, string]> = [];
  if (snapshot.DetailUrl) links.push(['告警详情', snapshot.DetailUrl]);
  if (snapshot.QueryUrl) links.push(['查询日志', snapshot.QueryUrl]);
  if (snapshot.AlertHistoryUrl) links.push(['告警历史', snapshot.AlertHistoryUrl]);
  if (snapshot.SilentUrl) links.push(['屏蔽告警', snapshot.SilentUrl]);
  if (snapshot.ClaimUrl) links.push(['认领告警', snapshot.ClaimUrl]);
  if (snapshot.ConsoleUrl) links.push(['控制台', snapshot.ConsoleUrl]);
  if (links.length > 0) {
    parts.push('\n### 🔗 9.相关链接');
    for (const [label, url] of links) {
      parts.push(`- [${label}](${url})`);
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
        '获取 CLS 告警执行详情日志。查询指定时间范围内的告警策略执行详情，使用方式类似 SearchLog，通过 Query 参数传入检索分析语句。\n\n' +
        '常用查询语句（直接作为 Query 参数传入）：\n\n' +
        '1. 查询执行详情列表（最常用）：\n' +
        '   NOT condition_evaluate_result:"Skip" AND condition_evaluate_result:[* TO *] | SELECT __TIMESTAMP__ as timestamp, alert_id, alert_name, monitored_object, topic_type, trigger, condition_evaluate_result, notification_send_result, notify_type, silent, record_id, record_group_id, summary_cn ORDER BY timestamp DESC LIMIT 1000\n\n' +
        '2. 按告警策略过滤执行详情：\n' +
        '   alert_id:"alarm-xxxx" AND NOT condition_evaluate_result:"Skip" AND condition_evaluate_result:[* TO *] | SELECT __TIMESTAMP__ as timestamp, alert_id, alert_name, monitored_object, trigger, condition_evaluate_result, notification_send_result, notify_type, silent, summary_cn ORDER BY timestamp DESC LIMIT 1000\n\n' +
        '3. 按监控对象过滤执行详情：\n' +
        '   monitored_object:"topic-id-xxxx" AND NOT condition_evaluate_result:"Skip" AND condition_evaluate_result:[* TO *] | SELECT __TIMESTAMP__ as timestamp, alert_id, alert_name, monitored_object, trigger, condition_evaluate_result, notification_send_result, notify_type, silent, summary_cn ORDER BY timestamp DESC LIMIT 1000\n\n' +
        '4. 查询执行失败的记录：\n' +
        '   condition_evaluate_result:"ProcessError" | SELECT __TIMESTAMP__ as timestamp, alert_id, alert_name, monitored_object, trigger, condition_evaluate_result, summary_cn ORDER BY timestamp DESC LIMIT 1000\n\n' +
        '5. 查询通知失败的记录：\n' +
        '   (notification_send_result:"SendFail" OR notification_send_result:"SendPartFail") | SELECT __TIMESTAMP__ as timestamp, alert_id, alert_name, monitored_object, notification_send_result, summary_cn ORDER BY timestamp DESC LIMIT 1000\n\n' +
        '6. 统计各告警策略执行次数 Top 50：\n' +
        "   NOT condition_evaluate_result:\"Skip\" AND condition_evaluate_result:[* TO *] | SELECT alert_id, alert_name, count(*) AS total, count_if(condition_evaluate_result='ProcessError') AS failure_count, count_if(notification_send_result!='NotSend') AS notify_total, count_if(notification_send_result='SendFail' OR notification_send_result='SendPartFail') AS notify_failure_count GROUP BY alert_id, alert_name ORDER BY total DESC LIMIT 50\n\n" +
        '常用过滤字段及枚举值：\n' +
        '- alert_id: 告警策略ID\n' +
        '- monitored_object: 监控对象（日志主题ID）\n' +
        '- condition_evaluate_result: QueryResultMatch(满足) / QueryResultUnmatch(不满足) / ProcessError(执行失败) / Skip(跳过)\n' +
        '- notification_send_result: SendSuccess(成功) / SendFail(失败) / SendPartFail(部分失败) / NotSend(未发送)\n\n' +
        '分页说明：首次不传 Context；若返回 ListOver 为 false，用返回的 Context 获取后续数据。' +
        'Context 有效期 1 小时，翻页时请勿修改其他参数，总计最多获取 1 万条。' +
        'SQL 分析结果的分页请使用 LIMIT/OFFSET。\n\n' +
        '返回信息：SQL 分析时返回 AnalysisRecords；非 SQL 查询时返回 Results 列表（每条含 Time、LogJson）、Context（分页标识）、ListOver（是否查询完毕）。',
      inputSchema: {
        Region: regionSchema,
        From: z.number().describe(MS_TIMESTAMP_FROM_DESC),
        To: z.number().describe(MS_TIMESTAMP_TO_DESC),
        Query: z
          .string()
          .describe('检索分析语句，支持 CLS 查询语法。使用 * 查询所有告警执行详情，支持管道符 | 进行 SQL 分析。'),
        Limit: z.number().optional().default(100).describe('单次返回条数，最大 1000，默认 100。'),
        Context: z
          .string()
          .optional()
          .describe('上下文标识符，用于分页查询获取后续数据。有效期 1 小时，翻页时请勿修改其他参数。'),
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
          UseNewAnalysis: true,
          From,
          To,
          Query,
          ...(Limit !== undefined && { Limit }),
          ...(Context !== undefined && { Context }),
          ...(Sort !== undefined && { Sort }),
        };

        const response = await clsClient.GetAlarmLog(capiParams);
        if (response.Analysis) {
          return formatResponse(response.AnalysisRecords);
        }
        return formatResponse({
          Results: response.Results?.map((result: any) => ({
            Time: result.Time,
            LogJson: result.LogJson,
          })),
          Context: response.Context,
          ListOver: response.ListOver,
        });
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
          return formatResponse('告警地址 URL 为空。', true);
        }

        // 修正常见 URL 格式错误
        const fixedUrl = fixUrlFormat(AlarmDetailUrl.trim());

        // 验证 URL 是否在允许的域名列表中
        if (!isAllowedAlarmUrl(fixedUrl)) {
          return formatResponse(
            `不允许的告警地址 URL: ${fixedUrl}。仅支持 alarm.cls.tencentcs.com、mc.tencent.com 或 monitor.cls.tencentcs.com 域名。`,
            true,
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

        // ⚠️ 后端在告警记录不存在时会把 nil 值序列化成字符串 "null",此时
        // JSON.parse("null") → null,若直接交给 formatAlarmDetail 会得到一份字段全是
        // "未知"的 Markdown,反而误导用户。这里把 null / 数组 / 非对象都当成"详情为空"处理。
        // 触发场景:跨账号查询(secretId 与告警归属账号不一致)、记录已过期等。
        if (recordLog === null || typeof recordLog !== 'object' || Array.isArray(recordLog)) {
          return formatResponse('告警详情为空，可能告警记录已过期或 URL 无效。', true);
        }

        // 把"地域代码 → 中文展示名"的反查放在调用方,formatAlarmDetail 保持纯渲染。
        // 优先级:
        //   1) AlertHistoryUrl 中 ?region= 解析出来的代码 → 通过 DescribeRegions 反查
        //   2) URL host 解析出来的 region 代码(如 ap-tokyo)→ 反查
        //   3) ResultsSnapshot.Region 已经是中文形态时直接展示(前端落库时已本地化)
        const snapshot = recordLog?.ResultsSnapshot || {};
        const regionFromAlertUrl = extractRegionFromAlertHistoryUrl(snapshot.AlertHistoryUrl);
        const regionCode = regionFromAlertUrl || region;
        let regionDisplay = '';
        if (regionCode) {
          regionDisplay = await getRegionDisplayName(String(regionCode));
        }
        if (!regionDisplay) {
          const snapshotRegion = snapshot.Region || recordLog?.Region;
          if (snapshotRegion) regionDisplay = String(snapshotRegion);
        }

        const markdown = formatAlarmDetail(recordLog, regionDisplay);
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

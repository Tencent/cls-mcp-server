# 腾讯云 CLS MCP Server

[![npm version](https://img.shields.io/npm/v/cls-mcp-server)](https://www.npmjs.com/package/cls-mcp-server)
[![license](https://img.shields.io/npm/l/cls-mcp-server)](LICENSE)

[English](README.md) | **中文**

腾讯云日志服务（CLS）MCP Server，基于 [Model Context Protocol](https://modelcontextprotocol.io/) 实现，让大语言模型能够直接访问腾讯云 CLS 的日志检索、指标查询等能力，无需编写代码即可完成日志分析。

> 📖 [腾讯云官方文档](https://cloud.tencent.com/document/product/614/118699#90415b66-8edb-43a9-ad5a-c2b0a97f5eaf) | 🚀 [SSE 托管服务 - MCP 市场（免费使用）](https://cloud.tencent.com/developer/mcp/server/11710)

## 核心能力

### 日志检索
| 工具名称 | 描述 |
| --- | --- |
| `SearchLog` | 根据查询条件搜索日志 |
| `DescribeLogContext` | 获取指定日志的上下文（前后 N 条日志） |
| `TextToSearchLogQuery` | 将自然语言描述转换为 CLS 查询语句 |

### 指标查询
| 工具名称 | 描述 |
| --- | --- |
| `QueryMetric` | 查询指标主题的实时值（PromQL 语法） |
| `QueryRangeMetric` | 查询指标主题在时间范围内的数据趋势 |

### 辅助工具
| 工具名称 | 描述 |
| --- | --- |
| `GetTopicInfoByName` | 按名称搜索日志主题或指标主题 |
| `GetRegionCodeByName` | 按地区名称获取腾讯云区域代码 |
| `ConvertTimeStringToTimestamp` | 时间字符串转换为时间戳 |
| `ConvertTimestampToTimeString` | 时间戳转换为时间字符串 |

## 使用场景

- **自然语言日志查询** — 使用自然语言查询日志，无需掌握复杂的查询语法，大幅降低日志分析门槛。
- **智能运维排障** — 整合至运维排障流程中，智能分析系统异常，快速定位问题根因。
- **自动生成查询语句** — 通过 `TextToSearchLogQuery` 将自然语言自动转换为 CLS 查询语句，实现更精准高效的日志检索。
- **业务指标监控** — 查询并监控指标主题的实时值与历史趋势，及时掌握系统运行状态。

## 快速开始

### 方式一：腾讯云 SSE 托管服务（无需本地环境）

使用腾讯云 MCP 市场提供的 SSE 托管服务，**无需安装 Node.js 或任何本地依赖**。前往 [MCP 市场](https://cloud.tencent.com/developer/mcp/server/11710) 获取 SSE 端点地址，然后配置 MCP 客户端：

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "name": "cls-mcp-server",
      "type": "sse",
      "isActive": true,
      "baseUrl": "<从MCP市场获取的SSE端点地址>"
    }
  }
}
```

### 方式二：NPX 启动（推荐的本地部署方式）

在 MCP 客户端的 `mcpServers` 配置中添加：

> **前置条件**：安装 [Node.js](https://nodejs.org/)（推荐 LTS 版本），准备腾讯云 [SecretId 和 SecretKey](https://console.cloud.tencent.com/cam/capi)。

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "isActive": true,
      "name": "cls-mcp-server",
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "cls-mcp-server@latest"
      ],
      "env": {
        "TRANSPORT": "stdio",
        "TENCENTCLOUD_SECRET_ID": "<YOUR_SECRET_ID>",
        "TENCENTCLOUD_SECRET_KEY": "<YOUR_SECRET_KEY>",
        "TZ": "Asia/Shanghai"
      }
    }
  }
}
```

### 方式三：自建 SSE 模式

> **前置条件**：安装 [Node.js](https://nodejs.org/)（推荐 LTS 版本），准备腾讯云 [SecretId 和 SecretKey](https://console.cloud.tencent.com/cam/capi)。

1. 在当前目录创建 `.env` 文件：

```bash
TRANSPORT=sse
TENCENTCLOUD_SECRET_ID=<YOUR_SECRET_ID>
TENCENTCLOUD_SECRET_KEY=<YOUR_SECRET_KEY>
PORT=3000
TZ=Asia/Shanghai
```

2. 启动 SSE 服务：

```bash
npx -y cls-mcp-server@latest
```

3. 在 MCP 客户端中配置：

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "name": "cls-mcp-server",
      "type": "sse",
      "isActive": true,
      "baseUrl": "http://localhost:3000/sse"
    }
  }
}
```

### 方式四：源码安装

> **前置条件**：安装 [Node.js](https://nodejs.org/)（推荐 LTS 版本），准备腾讯云 [SecretId 和 SecretKey](https://console.cloud.tencent.com/cam/capi)。

1. 克隆仓库并构建：

```bash
git clone <repository-url>
cd cls-mcp-server
npm install
npm run build
```

2. **Stdio 模式** — 在 MCP 客户端的 `mcpServers` 配置中添加：

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "isActive": true,
      "name": "cls-mcp-server",
      "type": "stdio",
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/cls-mcp-server/dist/index.js"
      ],
      "env": {
        "TRANSPORT": "stdio",
        "TENCENTCLOUD_SECRET_ID": "<YOUR_SECRET_ID>",
        "TENCENTCLOUD_SECRET_KEY": "<YOUR_SECRET_KEY>",
        "TZ": "Asia/Shanghai"
      }
    }
  }
}
```

3. **SSE 模式** — 在项目根目录创建 `.env` 文件：

```bash
TRANSPORT=sse
TENCENTCLOUD_SECRET_ID=<YOUR_SECRET_ID>
TENCENTCLOUD_SECRET_KEY=<YOUR_SECRET_KEY>
PORT=3000
TZ=Asia/Shanghai
```

启动 SSE 服务：

```bash
npm run start:sse
```

然后在 MCP 客户端中配置：

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "name": "cls-mcp-server",
      "type": "sse",
      "isActive": true,
      "baseUrl": "http://localhost:3000/sse"
    }
  }
}
```

## 配置参数说明

| 参数 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `TRANSPORT` | 否 | `stdio` | MCP 传输方式，可选 `stdio` 或 `sse` |
| `TENCENTCLOUD_SECRET_ID` | 是 | - | 腾讯云 API 密钥 SecretId |
| `TENCENTCLOUD_SECRET_KEY` | 是 | - | 腾讯云 API 密钥 SecretKey |
| `TENCENTCLOUD_API_BASE_HOST` | 否 | `tencentcloudapi.com` | 腾讯云 API 基础域名 |
| `MAX_LENGTH` | 否 | 不限制 | 返回内容最大长度，用于适配模型 Token 限制 |
| `PORT` | 否 | `3000` | SSE 模式下的服务端口 |
| `TZ` | 否 | 系统时区 | 时区设置，如 `Asia/Shanghai` |

## License

[Apache License 2.0](LICENSE)

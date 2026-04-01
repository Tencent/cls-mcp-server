# Tencent Cloud CLS MCP Server

[![npm version](https://img.shields.io/npm/v/cls-mcp-server)](https://www.npmjs.com/package/cls-mcp-server)
[![license](https://img.shields.io/npm/l/cls-mcp-server)](LICENSE)

**English** | [中文](README_ZH.md)

Tencent Cloud Log Service (CLS) MCP Server, built on the [Model Context Protocol](https://modelcontextprotocol.io/). It enables large language models to directly access CLS capabilities such as log search and metric queries — no code required.

> 📖 [Tencent Cloud Official Documentation](https://cloud.tencent.com/document/product/614/118699#90415b66-8edb-43a9-ad5a-c2b0a97f5eaf) | 🚀 [SSE Hosted Service on MCP Marketplace (Free)](https://cloud.tencent.com/developer/mcp/server/11710)

## Features

### Log Search
| Tool | Description |
| --- | --- |
| `SearchLog` | Search logs based on query conditions |
| `DescribeLogContext` | Retrieve the context (preceding and following N entries) of a specific log |
| `TextToSearchLogQuery` | Convert natural language descriptions into CLS query statements |

### Metric Query
| Tool | Description |
| --- | --- |
| `QueryMetric` | Query real-time values of metric topics (PromQL syntax) |
| `QueryRangeMetric` | Query metric data trends over a time range |

### Utilities
| Tool | Description |
| --- | --- |
| `GetTopicInfoByName` | Search log or metric topics by name |
| `GetRegionCodeByName` | Get Tencent Cloud region codes by region name |
| `ConvertTimeStringToTimestamp` | Convert time strings to timestamps |
| `ConvertTimestampToTimeString` | Convert timestamps to time strings |

## Use Cases

- **Natural Language Log Query** — Search logs using natural language without mastering complex query syntax, significantly reducing the barrier to log analysis.
- **Intelligent O&M Troubleshooting** — Integrate into O&M workflows to intelligently analyze system anomalies and quickly locate root causes.
- **Automated Query Generation** — Automatically generate CLS query statements from natural language via `TextToSearchLogQuery`, enabling more precise and efficient log retrieval.
- **Business Metric Monitoring** — Query and monitor real-time metric values and historical trends to keep track of system health.

## Getting Started

### Option 1: Tencent Cloud SSE Hosted Service (No Local Environment Required)

Use the hosted SSE service provided by Tencent Cloud MCP Marketplace — **no Node.js or any local installation needed**. Visit the [MCP Marketplace](https://cloud.tencent.com/developer/mcp/server/11710) to get your SSE endpoint, then configure your MCP client:

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "name": "cls-mcp-server",
      "type": "sse",
      "isActive": true,
      "baseUrl": "<SSE_ENDPOINT_FROM_MCP_MARKETPLACE>"
    }
  }
}
```

### Option 2: NPX (Recommended for Local Deployment)

Add the following to your MCP client's `mcpServers` configuration:

> **Prerequisites**: Install [Node.js](https://nodejs.org/) (LTS version recommended) and obtain Tencent Cloud [SecretId and SecretKey](https://console.cloud.tencent.com/cam/capi).

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

### Option 3: Self-hosted SSE Mode

> **Prerequisites**: Install [Node.js](https://nodejs.org/) (LTS version recommended) and obtain Tencent Cloud [SecretId and SecretKey](https://console.cloud.tencent.com/cam/capi).

1. Create a `.env` file in the current directory:

```bash
TRANSPORT=sse
TENCENTCLOUD_SECRET_ID=<YOUR_SECRET_ID>
TENCENTCLOUD_SECRET_KEY=<YOUR_SECRET_KEY>
PORT=3000
TZ=Asia/Shanghai
```

2. Start the SSE server:

```bash
npx -y cls-mcp-server@latest
```

3. Configure your MCP client:

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

### Option 4: Install from Source

> **Prerequisites**: Install [Node.js](https://nodejs.org/) (LTS version recommended) and obtain Tencent Cloud [SecretId and SecretKey](https://console.cloud.tencent.com/cam/capi).

1. Clone the repository and build:

```bash
git clone <repository-url>
cd cls-mcp-server
npm install
npm run build
```

2. **Stdio Mode** — Add the following to your MCP client's `mcpServers` configuration:

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

3. **SSE Mode** — Create a `.env` file in the project root:

```bash
TRANSPORT=sse
TENCENTCLOUD_SECRET_ID=<YOUR_SECRET_ID>
TENCENTCLOUD_SECRET_KEY=<YOUR_SECRET_KEY>
PORT=3000
TZ=Asia/Shanghai
```

Start the SSE server:

```bash
npm run start:sse
```

Then configure your MCP client:

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

## Configuration

| Parameter | Required | Default | Description |
| --- | --- | --- | --- |
| `TRANSPORT` | No | `stdio` | MCP transport mode: `stdio` or `sse` |
| `TENCENTCLOUD_SECRET_ID` | Yes | - | Tencent Cloud API SecretId |
| `TENCENTCLOUD_SECRET_KEY` | Yes | - | Tencent Cloud API SecretKey |
| `TENCENTCLOUD_API_BASE_HOST` | No | `tencentcloudapi.com` | Tencent Cloud API base host |
| `MAX_LENGTH` | No | Unlimited | Max response length, used to fit model token limits |
| `PORT` | No | `3000` | Server port for SSE mode |
| `TZ` | No | System timezone | Timezone setting, e.g. `Asia/Shanghai` |

## License

[Apache License 2.0](LICENSE)

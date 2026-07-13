# Tencent Cloud Log Service (CLS) MCP Server

[![npm version](https://img.shields.io/npm/v/cls-mcp-server)](https://www.npmjs.com/package/cls-mcp-server)
[![license](https://img.shields.io/npm/l/cls-mcp-server)](LICENSE)

**English** | [中文](README_ZH.md)

Tencent Cloud Log Service (CLS) MCP Server, built on the [Model Context Protocol](https://modelcontextprotocol.io/). It enables large language models to directly access CLS capabilities such as log search, metric queries, and alarm management — no code required.

> 📖 [Tencent Cloud Official Documentation](https://cloud.tencent.com/document/product/614/118699#90415b66-8edb-43a9-ad5a-c2b0a97f5eaf)

## Features

### Log Search
| Tool | Description |
| --- | --- |
| `SearchLog` | Search logs based on query conditions (CQL syntax) |
| `DescribeLogContext` | Retrieve the context (preceding and following N entries) of a specific log |
| `TextToSearchLogQuery` | Convert natural language descriptions into CLS query statements (CQL expert) |
| `DescribeLogHistogram` | Get log distribution histogram data within a specified time range |
| `DescribeIndex` | Get index configuration of a log topic (fields, full-text index, etc.) |

### Metric Query
| Tool | Description |
| --- | --- |
| `QueryMetric` | Query real-time values of metric topics (PromQL syntax) |
| `QueryRangeMetric` | Query metric data trends over a time range |

### Alarm Management
| Tool | Description |
| --- | --- |
| `DescribeAlarms` | List alarm policies with filtering support |
| `DescribeAlertRecordHistory` | Query alarm trigger/recovery history records |
| `GetAlarmLog` | Query alarm execution detail logs |
| `DescribeAlarmNotices` | List notification channel groups (email, SMS, WeChat, etc.) |
| `DescribeAlarmShields` | List alarm shield rules for a notification channel group |
| `DescribeNoticeContents` | List notification content templates |
| `DescribeWebCallbacks` | List webhook callback configurations |
| `GetAlarmDetail` | Get alarm details by parsing alarm notification URL (supports short/long links) |

### Utilities
| Tool | Description |
| --- | --- |
| `DescribeTopics` | Search log or metric topics by name, ID, or logset |
| `DescribeLogsets` | List logset containers with filtering support |
| `GetRegionCodeByName` | Get Tencent Cloud region codes by region name |
| `ConvertTimeStringToTimestamp` | Convert time strings to timestamps |
| `ConvertTimestampToTimeString` | Convert timestamps to time strings |

## Use Cases

- **Natural Language Log Query** — Search logs using natural language without mastering complex query syntax, significantly reducing the barrier to log analysis.
- **Intelligent O&M Troubleshooting** — Integrate into O&M workflows to intelligently analyze system anomalies and quickly locate root causes.
- **Automated Query Generation** — Automatically generate CLS query statements from natural language via `TextToSearchLogQuery`, enabling more precise and efficient log retrieval.
- **Business Metric Monitoring** — Query and monitor real-time metric values and historical trends to keep track of system health.
- **Alarm Management & Analysis** — View alarm policies, query alarm trigger/recovery history, and analyze alarm execution details to quickly understand alerting status.

## Configuration

| Parameter | Required | Default | Description |
| --- | --- | --- | --- |
| `TRANSPORT` | No | `stdio` | MCP transport mode: `stdio`, `http` (Streamable HTTP), or `sse` |
| `TENCENTCLOUD_SECRET_ID` | Yes | - | Tencent Cloud API SecretId |
| `TENCENTCLOUD_SECRET_KEY` | Yes | - | Tencent Cloud API SecretKey |
| `TENCENTCLOUD_API_BASE_HOST` | No | `tencentcloudapi.com` | Tencent Cloud API base host. Use `internal.tencentcloudapi.com` in VPC intranet environments |
| `MAX_LENGTH` | No | Unlimited | Max response length, used to fit model token limits |
| `PORT` | No | `3000` | Server port for `http` / `sse` mode |
| `TZ` | No | System timezone | Timezone setting, e.g. `Asia/Shanghai`. Used by time conversion tools (`ConvertTimeStringToTimestamp`, `ConvertTimestampToTimeString`) |

## Getting Started

### Option 1: NPX (Recommended for Local Deployment)

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

> To deploy within a Tencent Cloud VPC, add `"TENCENTCLOUD_API_BASE_HOST": "internal.tencentcloudapi.com"` to `env`.

### Option 2: Self-hosted Streamable HTTP Mode

> **Prerequisites**: Install [Node.js](https://nodejs.org/) (LTS version recommended) and obtain Tencent Cloud [SecretId and SecretKey](https://console.cloud.tencent.com/cam/capi).

This server runs Streamable HTTP in **stateless mode** — each request is independent, which makes it suitable for containerized deployments and horizontal scaling.

1. Create a `.env` file in the current directory:

```bash
TRANSPORT=http
TENCENTCLOUD_SECRET_ID=<YOUR_SECRET_ID>
TENCENTCLOUD_SECRET_KEY=<YOUR_SECRET_KEY>
# Uncomment the following line if deploying within a Tencent Cloud VPC
# TENCENTCLOUD_API_BASE_HOST=internal.tencentcloudapi.com
PORT=3000
TZ=Asia/Shanghai
```

2. Start the server:

```bash
npx -y cls-mcp-server@latest
```

3. Configure your MCP client:

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "name": "cls-mcp-server",
      "type": "http",
      "isActive": true,
      "url": "http://localhost:3000/mcp"
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
# Uncomment the following line if deploying within a Tencent Cloud VPC
# TENCENTCLOUD_API_BASE_HOST=internal.tencentcloudapi.com
PORT=3000
TZ=Asia/Shanghai
```

2. Start the server:

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

> To deploy within a Tencent Cloud VPC, add `"TENCENTCLOUD_API_BASE_HOST": "internal.tencentcloudapi.com"` to `env`.

3. **Streamable HTTP Mode** — Create a `.env` file in the project root:

```bash
TRANSPORT=http
TENCENTCLOUD_SECRET_ID=<YOUR_SECRET_ID>
TENCENTCLOUD_SECRET_KEY=<YOUR_SECRET_KEY>
# Uncomment the following line if deploying within a Tencent Cloud VPC
# TENCENTCLOUD_API_BASE_HOST=internal.tencentcloudapi.com
PORT=3000
TZ=Asia/Shanghai
```

Start the server:

```bash
npm run start
```

Then configure your MCP client:

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "name": "cls-mcp-server",
      "type": "http",
      "isActive": true,
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

4. **SSE Mode** — Create a `.env` file in the project root:

```bash
TRANSPORT=sse
TENCENTCLOUD_SECRET_ID=<YOUR_SECRET_ID>
TENCENTCLOUD_SECRET_KEY=<YOUR_SECRET_KEY>
# Uncomment the following line if deploying within a Tencent Cloud VPC
# TENCENTCLOUD_API_BASE_HOST=internal.tencentcloudapi.com
PORT=3000
TZ=Asia/Shanghai
```

Start the server:

```bash
npm run start
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

### Option 5: Docker Deployment

> **Prerequisites**: Install [Docker](https://docs.docker.com/get-docker/) and obtain Tencent Cloud [SecretId and SecretKey](https://console.cloud.tencent.com/cam/capi).

1. Build the Docker image:

```bash
docker build -t cls-mcp-server .
```

2. Run the container (Streamable HTTP mode, default):

> To deploy within a Tencent Cloud VPC, add `-e TENCENTCLOUD_API_BASE_HOST=internal.tencentcloudapi.com`.

```bash
docker run -d -p 3000:3000 \
  -e TENCENTCLOUD_SECRET_ID=<YOUR_SECRET_ID> \
  -e TENCENTCLOUD_SECRET_KEY=<YOUR_SECRET_KEY> \
  -e TZ=Asia/Shanghai \
  --name cls-mcp-server \
  cls-mcp-server
```

> To run the SSE transport instead, add `-e TRANSPORT=sse` and point the client at `/sse` with `"type": "sse"`.

3. Configure your MCP client:

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "name": "cls-mcp-server",
      "type": "http",
      "isActive": true,
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## License

[Apache License 2.0](LICENSE)

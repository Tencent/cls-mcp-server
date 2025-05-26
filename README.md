# CLS MCP Server

This project is a Node.js server that integrates with Tencent Cloud Log Service (CLS) and supports the Model Context Protocol (MCP).

## Configuration

### Install Node.js

Follow [Node.js](https://nodejs.org/) instructions to install Node.js.

### MCP Server Setup

#### Stdio (Recommend)

To configure `cls-mcp-server` as an MCP service in stdio transport, add the following JSON configuration to your `mcpServers` settings:

```json
{
  "mcpServers": {
    "cls-mcp-server": {
      "isActive": true,
      "name": "cls-mcp-server",
      "type": "stdio",
      "registryUrl": "",
      "command": "npx",
      "args": [
        "-y",
        "cls-mcp-server@latest"
      ],
      "env": {
        "TRANSPORT": "stdio",
        "TENCENTCLOUD_SECRET_ID": "YOUR_TENCENT_SECRET_ID",
        "TENCENTCLOUD_SECRET_KEY": "YOUR_TENCENT_SECRET_KEY",
        "TENCENTCLOUD_API_BASE_HOST": "tencentcloudapi.com",
        "TENCENTCLOUD_REGION": "ap-guangzhou",
        "MAX_LENGTH": "15000"
      }
    }
  }
}
```

Go to [Environment value explanation](#environment-value-explanation) for detail explanation.

#### SSE

1. Create `.env` in current path, config environment values:

```
TRANSPORT=sse
TENCENTCLOUD_SECRET_ID=YOUR_TENCENT_SECRET_ID
TENCENTCLOUD_SECRET_KEY=YOUR_TENCENT_SECRET_KEY
TENCENTCLOUD_API_BASE_HOST=tencentcloudapi.com
TENCENTCLOUD_REGION=ap-guangzhou
MAX_LENGTH=15000
PORT=3000
```

2. Run command to start sse server

```
npx -y cls-mcp-server@latest
```

3. Config your `mcpServers` settings

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

Go to [Environment value explanation](#environment-value-explanation) for detail explanation.

#### Environment value explanation

Replace `TRANSPORT` value to config MCP transport, `stdio` or `sse`. Default `stdio`.

Replace `YOUR_TENCENT_SECRET_ID` and `YOUR_TENCENT_SECRET_KEY` with your actual Tencent Cloud credentials.

Replace `TENCENTCLOUD_API_BASE_HOST` value if you need to change base host of Tencent Cloud API. Default "tencentcloudapi.com".

Replace `TENCENTCLOUD_REGION` value with your desired default region. Will only take effect if no region input from AI.

Replace `MAX_LENGTH` value to fit token length requirement of your AI model. If not provided, will send entire response to AI model.

Replace `PORT` value to change sse server port. Default `3000`. Will only take effect in sse transport.

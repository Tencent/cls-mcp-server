# CLS MCP Server

This project is a Node.js server that integrates with Tencent Cloud Log Service (CLS) and supports the Model Context Protocol (MCP).

## Configuration

### Install Node.js

Follow [Node.js](https://nodejs.org/) instructions to install Node.js.

### MCP Server Setup

To configure `cls-mcp-server` as an MCP service, add the following JSON configuration to your `mcpServers` settings:

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
        "cls-mcp-server"
      ],
      "env": {
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

Replace `YOUR_TENCENT_SECRET_KEY` and `YOUR_TENCENT_SECRET_ID` with your actual Tencent Cloud credentials.

Replace `TENCENTCLOUD_API_BASE_HOST` if you need to change base host of Tencent Cloud API. Default "tencentcloudapi.com".

Replace `TENCENTCLOUD_REGION` with your desired default region. Will only take effect if no region input from AI.

Replace `MAX_LENGTH` to fit token length requirement of your AI model. If not provided, will send entire response to AI model.

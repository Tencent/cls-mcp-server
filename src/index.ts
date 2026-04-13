#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import 'dotenv/config';
import express from 'express';

import { TIMEZONE_SHANGHAI, SEARCH_TIME_TEXT_FORMAT, ISO_8601_TIME_FORMAT } from './constants';
import { registerAlarmTools } from './tools/alarm';
import { registerLogSearchTools } from './tools/log-search';
import { registerMetricTools } from './tools/metric';
import { registerUtilityTools } from './tools/utility';
import { createClsClient } from './utils';

export { TIMEZONE_SHANGHAI, SEARCH_TIME_TEXT_FORMAT, ISO_8601_TIME_FORMAT };

function createMcpServer() {
  const mcpServer = new McpServer({
    name: 'cls-mcp-server',
    version: '1.0.0',
  });

  registerLogSearchTools(mcpServer, createClsClient);
  registerMetricTools(mcpServer, createClsClient);
  registerAlarmTools(mcpServer, createClsClient);
  registerUtilityTools(mcpServer, createClsClient);

  return mcpServer;
}

export { createMcpServer };

function main() {
  const transport = process.env.TRANSPORT;
  if (transport === 'sse') {
    const app = express();
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;

    const transports = new Map<string, SSEServerTransport>();

    app.get('/sse', (req, res) => {
      const sseTransport = new SSEServerTransport('/messages', res);
      const server = createMcpServer();
      transports.set(sseTransport.sessionId, sseTransport);
      res.on('close', () => {
        transports.delete(sseTransport.sessionId);
      });
      server.connect(sseTransport).catch((error) => {
        console.error('Fatal error in main():', error);
        process.exit(error?.code || 1);
      });
    });

    app.post('/messages', (req, res) => {
      const sessionId = req.query.sessionId as string;
      const sseTransport = transports.get(sessionId);
      if (sseTransport) {
        sseTransport.handlePostMessage(req, res);
      } else {
        res.status(404).send('Session not found');
      }
    });

    app.listen(port);

    console.log(`Started cls-mcp-server in sse transport on port ${port}.`);
  } else {
    const stdioTransport = new StdioServerTransport();
    const server = createMcpServer();
    server
      .connect(stdioTransport)
      .then(() => {
        console.log('Started cls-mcp-server in stdio transport.');
      })
      .catch((error) => {
        console.error('Fatal error in main():', error);
        process.exit(error?.code || 1);
      });
  }
}

if (process.env.NODE_ENV !== 'test') {
  main();
}

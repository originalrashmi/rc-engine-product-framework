/**
 * MCP Bridge -- Creates an in-process MCP server + client pair.
 *
 * This lets the web server call any of the 31 RC Engine tools
 * without reimplementing the tool handlers. It works by:
 *   1. Creating an McpServer instance and registering all tools
 *   2. Applying the same guardedTool wrapper as the main index.ts
 *   3. Connecting an MCP Client via InMemoryTransport
 *   4. Exposing callTool() and listTools() methods
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { guardedTool } from '../../dist/shared/tool-guard.js';
import { registerPreRcTools } from '../../dist/domains/pre-rc/tools.js';
import { registerRcPhaseTools } from '../../dist/domains/rc/tools/phase-tools.js';
import { registerRcGateTools } from '../../dist/domains/rc/tools/gate-tools.js';
import { registerRcUxTools } from '../../dist/domains/rc/tools/ux-tools.js';
import { registerPostRcTools } from '../../dist/domains/post-rc/tools.js';
import { registerTraceabilityTools } from '../../dist/domains/traceability/tools.js';
import { tokenTracker } from '../../dist/shared/token-tracker.js';

export interface ToolInfo {
  name: string;
  description: string;
}

export interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface McpBridge {
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  listTools: () => Promise<ToolInfo[]>;
  toolNames: string[];
}

export async function createMcpBridge(): Promise<McpBridge> {
  // 1. Create MCP server with all tools
  const server = new McpServer({ name: 'rc-engine-web', version: '1.0.0' });

  // Apply guardedTool wrapper (same as src/index.ts)
  const originalTool = server.tool.bind(server);
  server.tool = ((...toolArgs: unknown[]) => {
    const handler = toolArgs[toolArgs.length - 1];
    if (typeof handler === 'function') {
      toolArgs[toolArgs.length - 1] = guardedTool(handler as Parameters<typeof guardedTool>[0]);
    }
    return (originalTool as (...a: unknown[]) => unknown)(...toolArgs);
  }) as typeof server.tool;

  // Register all domain tools
  registerPreRcTools(server);
  registerRcPhaseTools(server);
  registerRcGateTools(server);
  registerRcUxTools(server);
  registerPostRcTools(server);
  registerTraceabilityTools(server);

  // Pipeline status tool (same as src/index.ts)
  server.tool(
    'rc_pipeline_status',
    'High-level pipeline overview with token usage and domain summary.',
    { project_path: z.string().describe('Absolute path to the project directory') },
    async (args) => {
      try {
        const projectPath = (args as { project_path: string }).project_path;
        tokenTracker.setProjectPath(projectPath);
        const summary = tokenTracker.getSummary();
        const output = `
===============================================
  RC ENGINE - PIPELINE STATUS
===============================================

${summary}

  REGISTERED DOMAINS:
    Pre-RC ......... 7 tools (prc_*)
    RC ............. 17 tools (rc_*, ux_*)
    Post-RC ........ 7 tools (postrc_*)
    Traceability ... 3 tools (trace_*)
    Pipeline ....... 1 tool  (rc_pipeline_status)
    Total: 35 tools
===============================================`;
        return { content: [{ type: 'text' as const, text: output }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // 2. Create linked in-memory transports
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  // 3. Connect server + client
  await server.connect(serverTransport);

  const client = new Client({ name: 'rc-engine-web-client', version: '1.0.0' });
  await client.connect(clientTransport);

  // 4. Cache tool list
  const toolList = await client.listTools();
  const toolNames = toolList.tools.map((t) => t.name);

  console.log(`[mcp-bridge] Connected with ${toolNames.length} tools`);

  return {
    async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
      const result = await client.callTool({ name, arguments: args });
      return result as ToolResult;
    },

    async listTools(): Promise<ToolInfo[]> {
      const list = await client.listTools();
      return list.tools.map((t) => ({
        name: t.name,
        description: t.description || '',
      }));
    },

    toolNames,
  };
}

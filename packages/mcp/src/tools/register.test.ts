import { describe, expect, it } from "bun:test";
import type { FastMCP } from "fastmcp";
import { registerSearchTools } from "./search.js";
import { registerFetchTools } from "./fetch.js";
import { registerVendorTools } from "./vendors.js";

interface RegisteredTool {
  name: string;
  description?: string;
  annotations?: Record<string, unknown>;
}

function fakeServer(): { server: FastMCP; tools: RegisteredTool[] } {
  const tools: RegisteredTool[] = [];
  const server = {
    addTool(definition: RegisteredTool) {
      tools.push(definition);
    },
  } as unknown as FastMCP;
  return { server, tools };
}

describe("MCP tool registration", () => {
  it("registers the three wide-search tools with read-only annotations", () => {
    const { server, tools } = fakeServer();
    registerSearchTools(server);
    registerFetchTools(server);
    registerVendorTools(server);

    expect(tools.map((tool) => tool.name)).toEqual([
      "search_wide",
      "fetch_pages",
      "list_vendors",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.description?.length).toBeGreaterThan(80);
    }

  });
});

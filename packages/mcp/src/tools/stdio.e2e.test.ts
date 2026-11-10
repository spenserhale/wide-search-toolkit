import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const dirs: string[] = [];
const serverEntry = join(import.meta.dirname, "..", "index.ts");

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("MCP stdio integration", () => {
  it(
    "starts the server, lists the tools, and calls list_vendors",
    async () => {
      const home = mkdtempSync(join(tmpdir(), "wide-search-mcp-"));
      dirs.push(home);
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["run", serverEntry],
        cwd: home,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: home,
          WIDE_SEARCH_KEYCHAIN: "0",
          WIDE_SEARCH_CONFIG_FILE: join(home, "missing-config.json"),
        },
      });
      const client = new Client(
        { name: "wide-search-stdio-test", version: "1.0.0" },
        { capabilities: {} },
      );

      try {
        await client.connect(transport);
        const tools = await client.listTools();
        expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
          "fetch_pages",
          "list_vendors",
          "search_wide",
        ]);

        const result = await client.callTool({ name: "list_vendors", arguments: {} });
        expect(result.isError ?? false).toBe(false);
        const content = result.content as Array<{ type: string; text?: string }> | undefined;
        const first = content?.[0];
        const text = first?.type === "text" ? (first.text ?? "") : "";
        const payload = JSON.parse(text) as {
          configured: number;
          vendors: Array<{ id: string }>;
        };
        expect(payload.configured).toBe(0);
        expect(payload.vendors).toHaveLength(9);
      } finally {
        await client.close();
      }
    },
    20_000,
  );
});

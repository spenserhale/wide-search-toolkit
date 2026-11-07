import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  loadOpEnv,
  opE2eEnabled,
  OP_E2E_VENDORS,
} from "../../../tests/e2e/op.js";

const template = join(import.meta.dirname, "..", "..", "..", "tests", "e2e", "op.env.tpl");
const serverEntry = join(import.meta.dirname, "..", "src", "index.ts");
const dirs: string[] = [];
const describeOp = opE2eEnabled() ? describe : describe.skip;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describeOp("MCP live adapters via op inject", () => {
  it(
    "searches all five 1Password-backed vendors through a real stdio client",
    async () => {
      const home = mkdtempSync(join(tmpdir(), "wide-search-op-mcp-"));
      dirs.push(home);
      const env = {
        PATH: process.env.PATH ?? "",
        HOME: home,
        WIDE_SEARCH_CONFIG_FILE: join(home, "missing-config.json"),
        ...loadOpEnv(template),
      };

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["run", serverEntry],
        cwd: home,
        env,
      });
      const client = new Client(
        { name: "wide-search-op-e2e", version: "1.0.0" },
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

        const vendorsResult = await client.callTool({
          name: "list_vendors",
          arguments: {},
        });
        expect(vendorsResult.isError ?? false).toBe(false);
        const vendorsContent = vendorsResult.content as
          | Array<{ type: string; text?: string }>
          | undefined;
        const vendorsText =
          vendorsContent?.[0]?.type === "text" ? (vendorsContent[0].text ?? "") : "";
        const vendorPayload = JSON.parse(vendorsText) as {
          configured: number;
          vendors: Array<{ id: string; configured: boolean }>;
        };
        expect(vendorPayload.configured).toBe(OP_E2E_VENDORS.length);
        for (const vendor of OP_E2E_VENDORS) {
          expect(vendorPayload.vendors.find((entry) => entry.id === vendor)?.configured).toBe(
            true,
          );
        }

        const searchResult = await client.callTool({
          name: "search_wide",
          arguments: {
            query: "TypeScript programming language",
            vendors: [...OP_E2E_VENDORS],
            max_per_vendor: 3,
            mode: "fast",
            budget_usd: 1,
            limit: 20,
            no_cache: true,
          },
        });
        expect(searchResult.isError ?? false).toBe(false);
        const searchContent = searchResult.content as
          | Array<{ type: string; text?: string }>
          | undefined;
        const searchText =
          searchContent?.[0]?.type === "text" ? (searchContent[0].text ?? "") : "";
        const report = JSON.parse(searchText) as {
          all_failed: boolean;
          vendors: Array<{
            vendor: string;
            selected: boolean;
            status: string;
            results: number;
            error?: string;
          }>;
          stats: {
            vendors_selected: number;
            vendors_ok: number;
            vendors_failed: number;
            results_before_dedupe: number;
          };
        };

        expect(report.all_failed).toBe(false);
        expect(report.stats.vendors_selected).toBe(OP_E2E_VENDORS.length);
        expect(report.stats.vendors_ok).toBe(OP_E2E_VENDORS.length);
        expect(report.stats.vendors_failed).toBe(0);
        expect(report.stats.results_before_dedupe).toBeGreaterThanOrEqual(OP_E2E_VENDORS.length);

        for (const vendor of OP_E2E_VENDORS) {
          const row = report.vendors.find((entry) => entry.vendor === vendor);
          expect(row, `missing vendor report for ${vendor}`).toBeDefined();
          expect(row?.selected).toBe(true);
          expect(row?.status, `${vendor} status: ${row?.error ?? "no error"}`).toBe("ok");
          expect(row?.results, `${vendor} returned no results`).toBeGreaterThan(0);
          expect(row?.error).toBeUndefined();
        }
      } finally {
        await client.close();
      }
    },
    120_000,
  );
});

import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import {
  extractTitle,
  fetchPages,
  htmlToText,
  isPrivateAddress,
} from "../src/fetch.js";

const servers: Server[] = [];

async function startServer(): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/ok" });
      response.end();
      return;
    }
    if (request.url === "/gzip") {
      const body = gzipSync(
        Buffer.from("<html><body><p>Compressed content</p></body></html>"),
      );
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-encoding": "gzip",
      });
      response.end(body);
      return;
    }
    if (request.url === "/big") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("x".repeat(5_000));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      "<html><head><title>Hello page</title></head><body>" +
        "<h1>Hello</h1><script>bad()</script>" +
        "<p>World &amp; friends.</p></body></html>",
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe("HTML extraction", () => {
  it("extracts a title and readable text without scripts", () => {
    const html = "<html><head><title>Hello &amp; goodbye</title></head><body><h1>Hi</h1><script>bad()</script><p>Text</p></body></html>";
    expect(extractTitle(html)).toBe("Hello & goodbye");
    const text = htmlToText(html);
    expect(text).toContain("Hi");
    expect(text).toContain("Text");
    expect(text).not.toContain("bad()");
  });
});

describe("isPrivateAddress", () => {
  it("blocks loopback, private, link-local, and mapped addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "::",
      "fe80::1",
      "fec0::1",
      "fc00::1",
      "fd12::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
  });

  it("allows public addresses", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("fetchPages", () => {
  it("fetches and extracts a public-looking page when private hosts are allowed", async () => {
    const base = await startServer();
    const report = await fetchPages({
      urls: [`${base}/ok`],
      allowPrivateHosts: true,
      maxCharsPerPage: 1_000,
    });

    expect(report.stats.ok).toBe(1);
    expect(report.pages[0]?.status).toBe(200);
    expect(report.pages[0]?.title).toBe("Hello page");
    expect(report.pages[0]?.text).toContain("World & friends.");
    expect(report.pages[0]?.text).not.toContain("bad()");
  });

  it("blocks a private target by default", async () => {
    const base = await startServer();
    const report = await fetchPages({ urls: [`${base}/ok`] });

    expect(report.stats.failed).toBe(1);
    expect(report.pages[0]?.error_code).toBe("E_FETCH");
    expect(report.pages[0]?.error).toContain("private");
    expect(report.pages[0]?.text).toBe("");
  });

  it("follows redirects and records the final URL", async () => {
    const base = await startServer();
    const report = await fetchPages({
      urls: [`${base}/redirect`],
      allowPrivateHosts: true,
    });

    expect(report.pages[0]?.status).toBe(200);
    expect(report.pages[0]?.final_url).toBe(`${base}/ok`);
  });

  it("decompresses gzip responses", async () => {
    const base = await startServer();
    const report = await fetchPages({
      urls: [`${base}/gzip`],
      allowPrivateHosts: true,
    });

    expect(report.pages[0]?.status).toBe(200);
    expect(report.pages[0]?.text).toContain("Compressed content");
  });

  it("truncates an oversized body to the per-page cap", async () => {
    const base = await startServer();
    const report = await fetchPages({
      urls: [`${base}/big`],
      allowPrivateHosts: true,
      maxCharsPerPage: 100,
    });

    expect(report.pages[0]?.truncated).toBe(true);
    expect((report.pages[0]?.text.length ?? 0)).toBeLessThanOrEqual(100);
  });

  it("enforces the aggregate character cap", async () => {
    const base = await startServer();
    const report = await fetchPages({
      urls: [`${base}/one`, `${base}/two`],
      allowPrivateHosts: true,
      maxCharsPerPage: 5_000,
      maxTotalChars: 10,
    });

    expect(report.stats.total_chars).toBeLessThanOrEqual(10);
    expect(report.pages.some((page) => page.total_cap_reached)).toBe(true);
  });
});

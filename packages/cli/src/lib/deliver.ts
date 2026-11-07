import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { WideSearchError } from "@wide-search-toolkit/sdk";

/**
 * `--deliver` is intentionally limited to stdout and files in v0.1. Webhook
 * delivery is a second outbound-request primitive and needs the same SSRF
 * guard as fetch; it is deferred rather than shipped half-safe.
 */
export async function deliverText(payload: string, target?: string): Promise<void> {
  if (!target || target === "stdout") {
    process.stdout.write(payload.endsWith("\n") ? payload : `${payload}\n`);
    return;
  }

  if (target.startsWith("file:")) {
    const path = target.slice("file:".length);
    if (!path) {
      throw new WideSearchError({
        code: "E_VALIDATION",
        message: "--deliver file: requires a path",
        got: target,
        hint: "Example: --deliver file:./results.json",
      });
    }
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.wide-search-tmp-${process.pid}`;
    await writeFile(temp, payload.endsWith("\n") ? payload : `${payload}\n`, { mode: 0o600 });
    await rename(temp, path);
    return;
  }

  throw new WideSearchError({
    code: "E_VALIDATION",
    message: "--deliver scheme is not supported",
    got: target,
    validValues: ["stdout", "file:<path>"],
    hint: "Webhook delivery is deferred for v0.1; write to a file and send it from your own workflow.",
  });
}

import { buildApplication, buildRouteMap } from "@stricli/core";
import { searchCommand } from "./commands/search.js";
import { fetchCommand } from "./commands/fetch.js";
import { vendorsCommand } from "./commands/vendors.js";
import { configShowCommand } from "./commands/config/show.js";
import { cacheClearCommand } from "./commands/cache/clear.js";
import { cacheStatsCommand } from "./commands/cache/stats.js";
import { authSetCommand } from "./commands/auth/set.js";
import { authListCommand } from "./commands/auth/list.js";
import { authDeleteCommand } from "./commands/auth/delete.js";
import { authMigrateCommand } from "./commands/auth/migrate.js";
import { agentContextCommand } from "./commands/agent-context.js";
import { feedbackCommand } from "./commands/feedback.js";
import { CLI_NAME, CLI_VERSION } from "./version.js";

const cacheRoutes = buildRouteMap({
  routes: {
    clear: cacheClearCommand,
    stats: cacheStatsCommand,
  },
  docs: {
    brief: "Inspect or clear the local search cache",
  },
});

const configRoutes = buildRouteMap({
  routes: {
    show: configShowCommand,
  },
  docs: {
    brief: "Inspect the resolved configuration (secrets redacted)",
  },
});

const authRoutes = buildRouteMap({
  routes: {
    set: authSetCommand,
    list: authListCommand,
    delete: authDeleteCommand,
    migrate: authMigrateCommand,
  },
  docs: {
    brief: "Store, list, and remove vendor keys in the OS keychain",
  },
});

const routes = buildRouteMap({
  routes: {
    search: searchCommand,
    fetch: fetchCommand,
    vendors: vendorsCommand,
    auth: authRoutes,
    config: configRoutes,
    cache: cacheRoutes,
    "agent-context": agentContextCommand,
    feedback: feedbackCommand,
  },
  docs: {
    brief: "Fan one query out to multiple web-search vendors and merge the results",
    fullDescription:
      "wide-search calls several independent search vendors, normalizes and dedupes their results " +
      "by canonical URL, ranks with reciprocal rank fusion, and reports per-vendor status, latency, " +
      "and estimated cost. Use `wide-search agent-context --json` for the machine-readable surface.",
  },
});

export const app = buildApplication(routes, {
  name: CLI_NAME,
  versionInfo: {
    currentVersion: CLI_VERSION,
  },
});

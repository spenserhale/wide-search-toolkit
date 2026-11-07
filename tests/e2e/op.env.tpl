# 1Password secret references only. This file contains no API keys.
# The E2E helper runs: op inject -i tests/e2e/op.env.tpl
# and captures stdout in memory. It passes the values to the CLI/MCP child
# process; it never writes the rendered values to disk or logs them.
EXA_API_KEY=op://Private/Exa/default
TAVILY_API_KEY=op://Private/Tavily/default
PARALLEL_API_KEY=op://Private/Parallel/default
FIRECRAWL_API_KEY=op://Private/Firecrawl/default
TINYFISH_API_KEY=op://Private/TinyFish/default

#!/usr/bin/env bun
import { createServer } from "./server.js";

createServer().start({
  transportType: "stdio",
});

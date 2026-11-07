/**
 * Derive a machine-readable description of the live Stricli route tree.
 * `agent-context` and the generated SKILL.md both read this, so commands,
 * flags, and positionals never drift from `--help`.
 */

export interface PositionalDescription {
  name: string;
  brief: string;
  optional?: boolean;
}

export interface FlagDescription {
  type: "boolean" | "string" | "enum" | "counter";
  brief: string;
  default?: unknown;
  optional?: boolean;
  values?: readonly string[];
  variadic?: boolean;
}

export interface CommandDescription {
  brief: string;
  description?: string;
  positional?: PositionalDescription[];
  flags?: Record<string, FlagDescription>;
  subcommands?: Record<string, CommandDescription>;
}

export type CommandTree = Record<string, CommandDescription>;

interface RouteEntry {
  name: Record<string, string>;
  target: unknown;
  hidden: boolean;
}

interface RouteMapLike {
  brief: string;
  getAllEntries: () => RouteEntry[];
}

interface CommandLike {
  brief: string;
  fullDescription?: string;
  parameters: { flags?: Record<string, unknown>; positional?: unknown };
}

function isRouteMap(target: unknown): target is RouteMapLike {
  return (
    typeof target === "object" &&
    target !== null &&
    typeof (target as { getAllEntries?: unknown }).getAllEntries === "function"
  );
}

function isCommand(target: unknown): target is CommandLike {
  return (
    typeof target === "object" &&
    target !== null &&
    "parameters" in target &&
    typeof (target as { usesFlag?: unknown }).usesFlag === "function"
  );
}

function entryName(entry: RouteEntry): string {
  return entry.name["convert-camel-to-kebab"] ?? entry.name["original"] ?? "<unnamed>";
}

export function describeTree(root: unknown): CommandTree {
  if (!isRouteMap(root)) return {};
  const tree: CommandTree = {};
  for (const entry of root.getAllEntries()) {
    if (entry.hidden) continue;
    tree[entryName(entry)] = describeTarget(entry.target);
  }
  return tree;
}

function describeTarget(target: unknown): CommandDescription {
  if (isCommand(target)) return describeCommand(target);
  if (isRouteMap(target)) {
    return { brief: target.brief, subcommands: describeTree(target) };
  }
  return { brief: "<unknown>" };
}

function describeCommand(command: CommandLike): CommandDescription {
  const out: CommandDescription = { brief: command.brief };
  if (command.fullDescription) out.description = command.fullDescription;

  const positional = describePositional(command.parameters.positional);
  if (positional.length > 0) out.positional = positional;

  const flags = command.parameters.flags;
  if (flags && Object.keys(flags).length > 0) {
    out.flags = {};
    for (const [key, definition] of Object.entries(flags)) {
      out.flags[`--${camelToKebab(key)}`] = describeFlag(definition);
    }
  }
  return out;
}

function describePositional(positional: unknown): PositionalDescription[] {
  if (!positional || typeof positional !== "object") return [];
  const value = positional as {
    kind?: string;
    parameters?: unknown[];
    parameter?: unknown;
  };
  if (value.kind === "tuple" && Array.isArray(value.parameters)) {
    return value.parameters.map((parameter, index) => {
      const entry = parameter as { brief?: string; placeholder?: string; optional?: boolean };
      return {
        name: entry.placeholder ?? `arg${index + 1}`,
        brief: entry.brief ?? "",
        ...(entry.optional ? { optional: true } : {}),
      };
    });
  }
  if (value.kind === "array" && value.parameter) {
    const entry = value.parameter as { brief?: string; placeholder?: string; optional?: boolean };
    return [
      {
        name: entry.placeholder ?? "arg",
        brief: entry.brief ?? "",
        optional: true,
      },
    ];
  }
  return [];
}

function describeFlag(definition: unknown): FlagDescription {
  const value = definition as {
    kind: string;
    brief?: string;
    default?: unknown;
    optional?: boolean;
    values?: readonly string[];
    variadic?: boolean | string;
  };
  const out: FlagDescription = {
    type: mapKind(value.kind),
    brief: value.brief ?? "",
  };
  if (value.default !== undefined) out.default = value.default;
  if (value.optional) out.optional = true;
  if (value.values) out.values = value.values;
  if (value.variadic) out.variadic = true;
  return out;
}

function mapKind(kind: string): FlagDescription["type"] {
  switch (kind) {
    case "boolean":
      return "boolean";
    case "enum":
      return "enum";
    case "counter":
      return "counter";
    default:
      return "string";
  }
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

export function flattenCommands(
  tree: CommandTree,
  prefix: string[] = [],
): Array<{ path: string[]; command: CommandDescription }> {
  const out: Array<{ path: string[]; command: CommandDescription }> = [];
  for (const [name, command] of Object.entries(tree)) {
    const path = [...prefix, name];
    if (command.subcommands) out.push(...flattenCommands(command.subcommands, path));
    else out.push({ path, command });
  }
  return out;
}

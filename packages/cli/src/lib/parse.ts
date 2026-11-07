export function parsePositiveInt(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`expected a positive integer (got: "${raw}")`);
  }
  return value;
}

export function parseNonNegativeNumber(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`expected a number greater than or equal to zero (got: "${raw}")`);
  }
  return value;
}

export function parsePositiveNumber(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`expected a positive number (got: "${raw}")`);
  }
  return value;
}

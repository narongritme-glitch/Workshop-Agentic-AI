const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...schema };
  if (typeof schema.type === 'string' && TYPES.has(schema.type)) {
    output.type = schema.type.toUpperCase();
  }
  if (schema.properties && typeof schema.properties === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      properties[key] = value && typeof value === 'object' ? toGeminiSchema(value as Record<string, unknown>) : value;
    }
    output.properties = properties;
  }
  if (schema.items && typeof schema.items === 'object') output.items = toGeminiSchema(schema.items as Record<string, unknown>);
  return output;
}
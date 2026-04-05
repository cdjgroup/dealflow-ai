"use client";

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

interface McpToolFormProps {
  schema: {
    type: "object";
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function McpToolForm({ schema, values, onChange, disabled }: McpToolFormProps) {
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No parameters required</p>;
  }

  const inputClass = "w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50";
  const selectClass = "w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50";

  return (
    <div className="space-y-3">
      {entries.map(([key, prop]) => {
        const labelText = prop.description ?? key;
        const isRequired = required.includes(key);
        const inputId = `mcp-field-${key}`;

        const handleChange = (newValue: unknown) => {
          onChange({ ...values, [key]: newValue });
        };

        let input: React.ReactNode;

        if (prop.enum && prop.enum.length > 0) {
          input = (
            <select
              id={inputId}
              value={values[key] as string ?? ""}
              onChange={(e) => handleChange(e.target.value)}
              disabled={disabled}
              className={selectClass}
            >
              {prop.enum.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          );
        } else if (prop.type === "boolean") {
          input = (
            <input
              id={inputId}
              type="checkbox"
              checked={Boolean(values[key])}
              onChange={(e) => handleChange(e.target.checked)}
              disabled={disabled}
              className="rounded border-border"
            />
          );
        } else if (prop.type === "number" || prop.type === "integer") {
          input = (
            <input
              id={inputId}
              type="number"
              value={values[key] != null ? (values[key] as number) : ""}
              onChange={(e) => {
                const raw = e.target.value;
                handleChange(raw === "" ? undefined : Number(raw));
              }}
              disabled={disabled}
              className={inputClass}
            />
          );
        } else {
          input = (
            <input
              id={inputId}
              type="text"
              value={values[key] as string ?? ""}
              onChange={(e) => handleChange(e.target.value)}
              disabled={disabled}
              className={inputClass}
            />
          );
        }

        return (
          <div key={key}>
            <label htmlFor={inputId} className="block text-xs font-medium text-muted-foreground mb-1">
              {labelText}{isRequired ? " *" : ""}
            </label>
            {input}
          </div>
        );
      })}
    </div>
  );
}

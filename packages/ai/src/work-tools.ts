import { tool } from "@openai/agents";

const tableParameters = {
  type: "object",
  properties: {
    title: { type: "string", description: "A short title for the table." },
    columns: {
      type: "array",
      items: { type: "string" },
      description: "Column names, in display order.",
    },
    rows: {
      type: "array",
      items: { type: "array", items: { type: "string" } },
      description: "Rows whose values correspond to the columns.",
    },
  },
  required: ["title", "columns", "rows"] as string[],
  additionalProperties: false,
} as const;

const pipelineParameters = {
  type: "object",
  properties: {
    name: { type: "string", description: "Name of the workflow." },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          owner: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "owner", "description"] as string[],
        additionalProperties: false,
      },
      description: "Ordered workflow steps.",
    },
  },
  required: ["name", "steps"] as string[],
  additionalProperties: false,
} as const;

const compareParameters = {
  type: "object",
  properties: {
    sources: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          content: {
            type: "string",
            description: "The source text to compare.",
          },
        },
        required: ["title", "url", "content"] as string[],
        additionalProperties: false,
      },
      description: "Source material already available to the agent.",
    },
  },
  required: ["sources"] as string[],
  additionalProperties: false,
} as const;

export function createWorkTools() {
  return [
    tool({
      name: "create_table",
      description:
        "Create a structured table from supplied rows. Use this for a comparison table, inventory, tracker, or organized data. Return the generated Markdown table and structured rows.",
      parameters: tableParameters,
      async execute(input: unknown) {
        const value = input as {
          title: string;
          columns: string[];
          rows: string[][];
        };
        const columns = value.columns.map(cleanCell);
        const rows = value.rows.map((row) =>
          columns.map((_, index) => cleanCell(row[index] ?? "")),
        );
        const markdown = [
          `### ${cleanCell(value.title)}`,
          `| ${columns.join(" | ")} |`,
          `| ${columns.map(() => "---").join(" | ")} |`,
          ...rows.map((row) => `| ${row.join(" | ")} |`),
        ].join("\n");
        return JSON.stringify({
          ok: true,
          title: value.title,
          columns,
          rows,
          markdown,
        });
      },
    }),
    tool({
      name: "create_pipeline",
      description:
        "Create an ordered, structured workflow pipeline from explicit steps. Use this for organizing work into stages, owners, and next actions. It does not execute external actions or change files.",
      parameters: pipelineParameters,
      async execute(input: unknown) {
        const value = input as {
          name: string;
          steps: Array<{ name: string; owner: string; description: string }>;
        };
        const pipeline = {
          id: `pipeline-${Date.now()}`,
          name: value.name.trim(),
          status: "draft",
          steps: value.steps.map((step, index) => ({
            order: index + 1,
            name: step.name.trim(),
            owner: step.owner.trim(),
            description: step.description.trim(),
            status: "pending",
          })),
        };
        return JSON.stringify({ ok: true, pipeline });
      },
    }),
    tool({
      name: "compare_sources",
      description:
        "Compare two or more source texts that are already available. Return structured source references and shared terms. Do not imply that a source was accessed if its content was not supplied.",
      parameters: compareParameters,
      async execute(input: unknown) {
        const value = input as {
          sources: Array<{ title: string; url: string; content: string }>;
        };
        const normalized = value.sources.map((source) => ({
          title: source.title.trim(),
          url: source.url.trim(),
          content: source.content.trim(),
          terms: new Set(
            source.content
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((term) => term.length > 4),
          ),
        }));
        const commonTerms = [...normalized[0].terms]
          .filter((term) => normalized.every((source) => source.terms.has(term)))
          .slice(0, 30);
        return JSON.stringify({
          ok: true,
          sources: normalized.map(({ terms, ...source }) => source),
          commonTerms,
          instruction:
            "Use the supplied source text to explain agreements and differences, and cite each source by title or URL.",
        });
      },
    }),
  ];
}

function cleanCell(value: string): string {
  return String(value).replace(/[|\n\r]/g, " ").trim();
}

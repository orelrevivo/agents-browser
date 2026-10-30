import { tool } from "@openai/agents";

export interface WorkspaceToolHost {
  listFiles(): Promise<unknown>;
  readFile(path: string): Promise<unknown>;
  writeFile(path: string, content: string): Promise<unknown>;
}

const pathDescription =
  "A relative path inside the user-selected workspace; never use .. or an absolute path.";

export function createWorkspaceTools(
  host: WorkspaceToolHost | undefined,
  approve?: (request: {
    toolName: string;
    description: string;
    input: unknown;
  }) => Promise<boolean>,
) {
  if (!host) return [];
  return [
    tool({
      name: "workspace_list_files",
      description:
        "List files in the user-selected workspace before editing it. An empty files array is valid: it means the selected workspace is empty and files can be created there.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      execute: async () => host.listFiles(),
    }),
    tool({
      name: "workspace_read_file",
      description: "Read a text file from the currently selected workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: pathDescription } },
        required: ["path"],
        additionalProperties: false,
      },
      execute: async (input: unknown) => host.readFile(String((input as { path: string }).path)),
    }),
    tool({
      name: "workspace_write_file",
      description: "Create or update a text file in the currently selected workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: pathDescription },
          content: { type: "string", description: "Complete replacement file contents." },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      execute: async (input: unknown) => {
        const value = input as { path: string; content: string };
        if (
          approve &&
          !(await approve({
            toolName: "workspace_write_file",
            description: `Write ${value.path} in the selected workspace`,
            input: value,
          }))
        ) {
          throw new Error("Workspace write was not approved.");
        }
        return host.writeFile(value.path, value.content);
      },
    }),
  ];
}

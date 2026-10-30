import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, File, FolderOpen, Search, X } from "lucide-react";
import { Button, Input } from "@groubot/ui";

type WorkspaceFile = { name: string; path: string; file: File };
type DirectoryHandle = {
  kind: "directory";
  name: string;
  values: () => AsyncIterableIterator<FileHandle | DirectoryHandle>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandle>;
};
type FileHandle = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
  createWritable?: () => Promise<{
    write: (content: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type WorkspaceBridge = {
  listFiles: () => Promise<unknown>;
  readFile: (path: string) => Promise<unknown>;
  writeFile: (path: string, content: string) => Promise<unknown>;
};

type WorkspaceWindow = Window & {
  groubotSelectedDirectory?: DirectoryHandle;
  groubotSelectedFiles?: File[];
};

async function readDirectory(handle: DirectoryHandle, prefix = ""): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [];
  for await (const entry of handle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file") {
      files.push({ file: await entry.getFile(), name: entry.name, path });
    } else {
      files.push(...(await readDirectory(entry, path)));
    }
  }
  return files;
}

async function resolveFile(
  root: DirectoryHandle | undefined,
  path: string,
  create = false,
): Promise<FileHandle> {
  if (!root) throw new Error("Open a workspace folder before asking the agent to edit files.");
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Workspace paths must be relative and cannot contain . or ...");
  }
  let directory = root;
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }
  return directory.getFileHandle(segments.at(-1)!, { create });
}

export function WorkspaceFilesPanel({
  initialFolderName,
  onClose,
}: {
  initialFolderName?: string;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const directoryRef = useRef<DirectoryHandle | undefined>(
    (window as WorkspaceWindow).groubotSelectedDirectory,
  );
  const memoryFilesRef = useRef<Map<string, File>>(new Map());
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [folderName, setFolderName] = useState(initialFolderName);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<WorkspaceFile>();
  const [content, setContent] = useState("");

  useEffect(() => {
    const workspace = (window as WorkspaceWindow & { groubotWorkspace?: WorkspaceBridge })
      .groubotWorkspace;
    const api: WorkspaceBridge = {
      listFiles: async () => ({
        root:
          directoryRef.current?.name ?? (memoryFilesRef.current.size ? (folderName ?? null) : null),
        files: directoryRef.current
          ? await readDirectory(directoryRef.current)
          : Array.from(memoryFilesRef.current, ([path]) => ({ path })),
      }),
      readFile: async (path) => {
        const memoryFile = memoryFilesRef.current.get(path);
        if (memoryFile) return { path, content: await memoryFile.text() };
        const file = await resolveFile(directoryRef.current, path);
        return { path, content: await file.getFile().then((value) => value.text()) };
      },
      writeFile: async (path, nextContent) => {
        if (!directoryRef.current) {
          const file = new globalThis.File([nextContent], path.split("/").at(-1) ?? path);
          memoryFilesRef.current.set(path, file);
          setFiles(
            Array.from(memoryFilesRef.current, ([filePath, nextFile]) => ({
              file: nextFile,
              name: nextFile.name,
              path: filePath,
            })),
          );
          return { path, written: true, persistent: false };
        }
        const file = await resolveFile(directoryRef.current, path, true);
        if (!file.createWritable) throw new Error("This workspace does not support writing files.");
        const writable = await file.createWritable();
        await writable.write(nextContent);
        await writable.close();
        if (directoryRef.current) setFiles(await readDirectory(directoryRef.current));
        return { path, written: true };
      },
    };
    (window as Window & { groubotWorkspace?: WorkspaceBridge }).groubotWorkspace = api;
    return () => {
      const current = (window as Window & { groubotWorkspace?: WorkspaceBridge }).groubotWorkspace;
      if (current === api)
        delete (window as WorkspaceWindow & { groubotWorkspace?: WorkspaceBridge })
          .groubotWorkspace;
    };
  }, []);

  useEffect(() => {
    if (initialFolderName) setFolderName(initialFolderName);
  }, [initialFolderName]);

  useEffect(() => {
    const loadSelectedWorkspace = () => {
      const workspaceWindow = window as WorkspaceWindow;
      const directory = workspaceWindow.groubotSelectedDirectory;
      if (
        directory &&
        directoryRef.current !== directory &&
        typeof directory.values === "function"
      ) {
        directoryRef.current = directory;
        memoryFilesRef.current.clear();
        setFolderName(directory.name);
        void readDirectory(directory).then((next) => setFiles(next));
        return;
      }
      const selectedFiles = workspaceWindow.groubotSelectedFiles;
      if (selectedFiles?.length) {
        directoryRef.current = undefined;
        memoryFilesRef.current = new Map(
          selectedFiles.map((file) => [file.webkitRelativePath || file.name, file]),
        );
        const firstPath = selectedFiles[0]?.webkitRelativePath || selectedFiles[0]?.name;
        setFolderName(firstPath?.split("/")[0]);
        setFiles(
          Array.from(memoryFilesRef.current, ([path, file]) => ({
            file,
            name: file.name,
            path,
          })),
        );
      }
    };
    loadSelectedWorkspace();
    window.addEventListener("groubot-workspace-selected", loadSelectedWorkspace);
    return () => window.removeEventListener("groubot-workspace-selected", loadSelectedWorkspace);
  }, []);

  const visibleFiles = useMemo(
    () => files.filter((item) => item.path.toLowerCase().includes(filter.toLowerCase())),
    [files, filter],
  );

  async function openFile(item: WorkspaceFile) {
    setSelected(item);
    setContent(await item.file.text());
  }

  async function chooseFolder() {
    const picker = (
      window as Window & {
        showDirectoryPicker?: () => Promise<DirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      inputRef.current?.click();
      return;
    }
    try {
      const directory = await picker();
      if (typeof directory.values !== "function") {
        inputRef.current?.click();
        return;
      }
      directoryRef.current = directory;
      (window as WorkspaceWindow).groubotSelectedDirectory = directory;
      delete (window as WorkspaceWindow).groubotSelectedFiles;
      memoryFilesRef.current.clear();
      setFolderName(directory.name);
      setFiles(await readDirectory(directory));
      setSelected(undefined);
      setContent("");
    } catch {
      // Closing the native picker is a normal cancellation, not an error.
    }
  }

  return (
    <aside className="absolute inset-0 z-30 flex min-w-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          aria-label="Workspace root"
          className="font-mono text-sm"
          type="button"
        >
          /
        </button>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {folderName
            ? `/${folderName}${selected ? `/${selected.path.split("/").slice(1).join("/")}` : ""}`
            : "No folder selected"}
        </span>
        <Button
          aria-label="Close files"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-xs leading-5 text-muted-foreground">
              {content || "(empty file)"}
            </pre>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
              <FolderOpen className="size-8" />
              <p>Open a file from the workspace tree</p>
            </div>
          )}
        </section>
        <section className="flex w-72 shrink-0 flex-col border-l border-border">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-muted-foreground" />
              <Input
                aria-label="Filter files"
                className="h-7 pl-7 text-xs"
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter files..."
                value={filter}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {visibleFiles.map((item) => (
              <button
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${selected?.path === item.path ? "bg-accent" : ""}`}
                key={item.path}
                onClick={() => void openFile(item)}
                type="button"
              >
                <File className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{item.path}</span>
              </button>
            ))}
            {files.length === 0 && (
              <p className="px-2 py-5 text-center text-xs text-muted-foreground">
                {folderName
                  ? "This workspace is empty. The agent can create files here."
                  : "Choose a workspace folder to browse files."}
              </p>
            )}
          </div>
          <div className="border-t border-border p-2">
            <Button
              className="w-full"
              onClick={() => void chooseFolder()}
              size="sm"
            >
              <FolderOpen className="mr-2 size-4" /> Open folder
            </Button>
            {selected && (
              <Button
                className="mt-2 w-full"
                onClick={() => void navigator.clipboard?.writeText(selected.path)}
                size="sm"
                variant="outline"
              >
                <Copy className="mr-2 size-3.5" /> Copy path
              </Button>
            )}
            <input
              className="hidden"
              onChange={(event) => {
                const selectedFiles = Array.from(event.target.files ?? []);
                const firstPath = selectedFiles[0]?.webkitRelativePath || selectedFiles[0]?.name;
                (window as WorkspaceWindow).groubotSelectedFiles = selectedFiles;
                delete (window as WorkspaceWindow).groubotSelectedDirectory;
                const next = selectedFiles.map((file) => ({
                  file,
                  name: file.name,
                  path: file.webkitRelativePath || file.name,
                }));
                setFiles(next);
                directoryRef.current = undefined;
                setFolderName(firstPath?.split("/")[0]);
                setSelected(undefined);
                setContent("");
                window.dispatchEvent(new CustomEvent("groubot-workspace-selected"));
                event.target.value = "";
              }}
              ref={inputRef}
              type="file"
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            />
          </div>
        </section>
      </div>
    </aside>
  );
}

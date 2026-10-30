import { useEffect, useRef, useState, type RefObject } from "react";
import type { ChatMessage, Skill } from "@groubot/db";
import type { BrowserTabState } from "@groubot/browser/types";
import { Button, Popover, PopoverContent, PopoverTrigger, Textarea } from "@groubot/ui";
import {
  ArrowUp,
  FolderOpen,
  Globe2,
  Image as ImageIcon,
  Plus,
  Reply,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { SkillToken, TabToken } from "./SkillToken";

export function ChatComposer({
  canSend,
  selectedAgentName,
  skills,
  tabs,
  onSubmit,
  onCancel,
  onPermissionModeChange,
  permissionMode = "ask",
  compact = false,
  busy = false,
  replyingTo,
  onClearReply,
  onFolderSelect,
}: {
  canSend: boolean;
  selectedAgentName?: string;
  skills: Skill[];
  tabs: BrowserTabState[];
  onSubmit: (content: string) => Promise<void>;
  onCancel: () => void;
  onPermissionModeChange?: (mode: "ask" | "full") => void;
  permissionMode?: "ask" | "full";
  compact?: boolean;
  busy?: boolean;
  replyingTo?: ChatMessage;
  onClearReply?: () => void;
  onFolderSelect?: (folderName?: string) => void;
}) {
  const composerWidth = compact ? "max-w-2xl" : "max-w-[42rem]";
  const [value, setValue] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<BrowserTabState[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>();
  const [selectedImage, setSelectedImage] = useState<{ name: string; url: string }>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!compact) textareaRef.current?.focus();
  }, [compact]);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  async function submit() {
    const content = value.trim();
    const attachments = [
      ...selectedSkills.map((skill) => `/${skill.name}`),
      ...selectedTabs.map((tab) => `[${tab.title || "Tab"}](${tab.url})`),
      ...(selectedFolder ? [`{folder:${selectedFolder}}`] : []),
      ...(selectedImage ? [`[Image attached: ${selectedImage.name}]`] : []),
    ];
    if ((!content && attachments.length === 0) || busy) return;

    const submittedContent = [...attachments, content].join(" ");

    setValue("");
    setSelectedSkills([]);
    setSelectedTabs([]);
    setSelectedFolder(undefined);
    setSelectedImage(undefined);
    await onSubmit(submittedContent);
  }

  function addSkill(skill: Skill) {
    setSelectedSkills((current) =>
      current.some((item) => item.id === skill.id) ? current : [...current, skill],
    );
    textareaRef.current?.focus();
  }

  function addTab(tab: BrowserTabState) {
    setSelectedTabs((current) =>
      current.some((item) => item.id === tab.id) ? current : [...current, tab],
    );
    textareaRef.current?.focus();
  }

  const tools = (
    <ComposerTools
      addSkill={addSkill}
      addTab={addTab}
      folderInputRef={folderInputRef}
      onImageSelect={(file) => {
        if (!file.type.startsWith("image/")) return;
        setSelectedImage((current) => {
          if (current) URL.revokeObjectURL(current.url);
          return { name: file.name, url: URL.createObjectURL(file) };
        });
        textareaRef.current?.focus();
      }}
      onFolderNameSelect={(folderName) => {
        setSelectedFolder(folderName);
        onFolderSelect?.(folderName);
      }}
      skills={skills}
      tabs={tabs}
    />
  );

  return (
    <div className={compact ? "w-full" : "w-full px-3 pb-3"}>
      <div
        className={`relative z-10 mx-auto rounded-xl border border-border/80 bg-card transition-[border-color,box-shadow] duration-200 focus-within:border-primary/50 focus-within:shadow-[0_0_0_1px_hsl(var(--primary)/0.08)] ${composerWidth} ${compact ? "shadow-none" : ""}`}
      >
        {(selectedSkills.length > 0 || selectedTabs.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            {selectedSkills.map((skill) => (
              <SkillToken
                key={skill.id}
                name={skill.name}
                onRemove={() =>
                  setSelectedSkills((current) => current.filter((item) => item.id !== skill.id))
                }
                removable
              />
            ))}
            {selectedTabs.map((tab) => (
              <TabToken
                key={tab.id}
                onRemove={() =>
                  setSelectedTabs((current) => current.filter((item) => item.id !== tab.id))
                }
                removable
                title={tab.title || "Tab"}
                url={tab.url}
              />
            ))}
          </div>
        )}
        {selectedFolder && (
          <div className="px-4 pt-3">
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs text-foreground">
              <FolderOpen className="size-3 text-muted-foreground" />
              <span className="max-w-48 truncate">{selectedFolder}</span>
              <button
                aria-label={`Remove ${selectedFolder} folder`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSelectedFolder(undefined);
                  onFolderSelect?.();
                }}
                type="button"
              >
                ×
              </button>
            </span>
          </div>
        )}
        {replyingTo && (
          <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
            <Reply className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-primary">
                Replying to {replyingTo.role === "assistant" ? "the assistant" : "your message"}
              </p>
              <p className="mt-0.5 truncate text-muted-foreground">{replyingTo.content}</p>
            </div>
            <button
              aria-label="Cancel reply"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onClearReply}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {selectedImage && (
          <div className="group relative mx-3 mt-3 size-20 overflow-hidden rounded-lg border border-border bg-muted">
            <img
              alt={selectedImage.name}
              className="size-full object-cover"
              src={selectedImage.url}
            />
            <button
              aria-label={`Remove ${selectedImage.name}`}
              className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => {
                URL.revokeObjectURL(selectedImage.url);
                setSelectedImage(undefined);
              }}
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        <Textarea
          ref={textareaRef}
          aria-label="Chat message"
          className="min-h-14 resize-none border-0 bg-transparent px-3.5 pb-1.5 pt-3 text-[13px] leading-5 shadow-none focus-visible:ring-0"
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Backspace" &&
              !value &&
              (selectedTabs.length > 0 || selectedSkills.length > 0)
            ) {
              event.preventDefault();
              if (selectedTabs.length > 0) {
                setSelectedTabs((current) => current.slice(0, -1));
              } else {
                setSelectedSkills((current) => current.slice(0, -1));
              }
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={selectedAgentName ? `Work with ${selectedAgentName}` : "Ask anything..."}
          value={value}
        />
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {!compact ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    aria-label="More message tools"
                    className="size-7 text-muted-foreground"
                    size="icon"
                    variant="ghost"
                  >
                    <Plus className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-56 p-1.5"
                  side="top"
                  sideOffset={8}
                >
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Add to message
                  </p>
                  {tools}
                </PopoverContent>
              </Popover>
            ) : null}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  aria-label="Browser permissions"
                  className="h-7 gap-1.5 px-2 text-[10px] text-muted-foreground"
                  size="sm"
                  variant="ghost"
                >
                  <ShieldCheck className="size-3.5" />
                  {permissionMode === "ask" ? "Ask for approval" : "Full access"}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 p-3 text-xs"
              >
                <p className="font-medium text-foreground">Browser permissions</p>
                <p className="mt-1 leading-5 text-muted-foreground">
                  Choose how Groubot should handle actions that can change a website.
                </p>
                <button
                  className={`mt-3 flex w-full items-start gap-2 rounded-md border p-2 text-left transition ${permissionMode === "ask" ? "border-primary/50 bg-primary/10" : "border-border hover:bg-accent"}`}
                  onClick={() => onPermissionModeChange?.("ask")}
                  type="button"
                >
                  <ShieldCheck className="mt-0.5 size-3.5 text-primary" />
                  <span>
                    <span className="block font-medium">Ask for approval</span>
                    <span className="text-muted-foreground">
                      Recommended for browsing and forms.
                    </span>
                  </span>
                </button>
                <button
                  className={`mt-2 flex w-full items-start gap-2 rounded-md border p-2 text-left transition ${permissionMode === "full" ? "border-primary/50 bg-primary/10" : "border-border hover:bg-accent"}`}
                  onClick={() => onPermissionModeChange?.("full")}
                  type="button"
                >
                  <ShieldCheck className="mt-0.5 size-3.5" />
                  <span>
                    <span className="block font-medium">Full access</span>
                    <span className="text-muted-foreground">
                      Proceed without approval prompts. You can still cancel a run.
                    </span>
                  </span>
                </button>
              </PopoverContent>
            </Popover>
          </div>
          <Button
            aria-label={busy ? "Cancel response" : "Send message"}
            className="size-7 rounded-md bg-primary/20 text-primary hover:bg-primary/30"
            disabled={!busy && (!value.trim() || !canSend)}
            onClick={() => {
              if (busy) onCancel();
              else void submit();
            }}
            size="icon"
          >
            <ArrowUp className={`size-3.5 transition-transform ${busy ? "rotate-45" : ""}`} />
          </Button>
        </div>
      </div>
      {compact ? (
        <div
          className={`relative z-0 mx-auto -mt-2 flex items-center justify-start gap-0.5 rounded-b-lg bg-transparent px-1 pb-0.5 pt-2.5 ${composerWidth}`}
        >
          {tools}
        </div>
      ) : null}
      <input
        className="hidden"
        onChange={(event) => {
          const selectedFiles = Array.from(event.target.files ?? []);
          const firstFile = selectedFiles[0];
          const folder = firstFile?.webkitRelativePath?.split("/")[0] || firstFile?.name;
          (window as Window & { groubotSelectedFiles?: File[] }).groubotSelectedFiles =
            selectedFiles;
          window.dispatchEvent(new CustomEvent("groubot-workspace-selected"));
          setSelectedFolder(folder || undefined);
          onFolderSelect?.(folder || undefined);
          event.target.value = "";
        }}
        ref={folderInputRef}
        type="file"
      />
    </div>
  );
}

function ComposerTools({
  addSkill,
  addTab,
  folderInputRef,
  onImageSelect,
  onFolderNameSelect,
  skills,
  tabs,
}: {
  addSkill: (skill: Skill) => void;
  addTab: (tab: BrowserTabState) => void;
  folderInputRef: RefObject<HTMLInputElement | null>;
  onImageSelect: (file: File) => void;
  onFolderNameSelect: (folderName: string) => void;
  skills: Skill[];
  tabs: BrowserTabState[];
}) {
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label="Insert a skill stub"
            className="h-7 gap-1.5 px-2 text-[10px] text-muted-foreground"
            size="sm"
            variant="ghost"
          >
            <Sparkles className="size-3.5" />
            Skill Stubs
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-64 p-2"
        >
          <p className="px-2 py-1 text-xs font-medium">Insert a skill stub</p>
          {skills.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              Create a skill to use it here.
            </p>
          ) : (
            <div className="grid gap-1">
              {skills.map((skill) => (
                <Button
                  className="h-8 justify-start text-xs"
                  key={skill.id}
                  onClick={() => addSkill(skill)}
                  variant="ghost"
                >
                  /{skill.name}
                </Button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label="Insert a browser tab"
            className="h-7 gap-1.5 px-2 text-[10px] text-muted-foreground"
            size="sm"
            variant="ghost"
          >
            <Globe2 className="size-3.5" />
            Tabs
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-80 p-2"
        >
          <p className="px-2 py-1 text-xs font-medium">Add a tab as context</p>
          {tabs.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">No open tabs.</p>
          ) : (
            <div className="grid max-h-64 gap-1 overflow-y-auto">
              {tabs.map((tab) => (
                <Button
                  className="h-auto justify-start gap-2 px-2 py-2 text-left text-xs"
                  key={tab.id}
                  onClick={() => addTab(tab)}
                  variant="ghost"
                >
                  {tab.faviconUrl ? (
                    <img
                      alt=""
                      className="size-3.5 shrink-0 rounded-sm"
                      src={tab.faviconUrl}
                    />
                  ) : (
                    <Globe2 className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{tab.title || "New tab"}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {tab.url}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Button
        aria-label="Upload a folder from your computer"
        className="h-7 gap-1.5 px-2 text-[10px] text-muted-foreground"
        onClick={() => {
          const picker = (
            window as Window & {
              showDirectoryPicker?: () => Promise<{ name: string; values?: unknown }>;
            }
          ).showDirectoryPicker;
          if (picker) {
            void picker()
              .then((directory) => {
                if (typeof directory.values !== "function") {
                  folderInputRef.current?.click();
                  return;
                }
                (
                  window as Window & { groubotSelectedDirectory?: unknown }
                ).groubotSelectedDirectory = directory;
                onFolderNameSelect(directory.name);
              })
              .catch(() => undefined);
          } else {
            folderInputRef.current?.click();
          }
        }}
        size="sm"
        variant="ghost"
      >
        <FolderOpen className="size-3.5" />
        Upload from computer
      </Button>
      <Button
        aria-label="Upload an image"
        className="h-7 gap-1.5 px-2 text-[10px] text-muted-foreground"
        onClick={() => document.getElementById("groubot-image-upload")?.click()}
        size="sm"
        variant="ghost"
      >
        <ImageIcon className="size-3.5" />
        Upload image
      </Button>
      <input
        accept="image/*"
        className="hidden"
        id="groubot-image-upload"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImageSelect(file);
          event.target.value = "";
        }}
        type="file"
      />
    </>
  );
}

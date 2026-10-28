import { useEffect, useRef, useState } from "react";
import type { Skill } from "@groubot/db";
import type { BrowserTabState } from "@groubot/browser/types";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
} from "@groubot/ui";
import {
  ArrowUp,
  FolderOpen,
  Globe2,
  ShieldCheck,
  Sparkles,
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
}) {
  const composerWidth = compact ? "max-w-2xl" : "max-w-3xl";
  const [value, setValue] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<BrowserTabState[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>();
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
    if (!content || busy) return;

    const attachments = [
      ...selectedSkills.map((skill) => `/${skill.name}`),
      ...selectedTabs.map(
        (tab) => `[${tab.title || "Tab"}](${tab.url})`,
      ),
      ...(selectedFolder ? [`{folder:${selectedFolder}}`] : []),
    ];
    const submittedContent = [...attachments, content].join(" ");

    setValue("");
    setSelectedSkills([]);
    setSelectedTabs([]);
    setSelectedFolder(undefined);
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

  return (
    <div
      className={
        compact
          ? "w-full"
          : "w-full bg-background/95 p-4 backdrop-blur"
      }
    >
      <div
        className={`relative z-10 mx-auto rounded-2xl border border-border/80 bg-card transition-colors focus-within:border-primary/50 ${composerWidth} ${compact ? "shadow-none" : ""}`}
      >
        {(selectedSkills.length > 0 || selectedTabs.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            {selectedSkills.map((skill) => (
              <SkillToken
                key={skill.id}
                name={skill.name}
                onRemove={() =>
                  setSelectedSkills((current) =>
                    current.filter((item) => item.id !== skill.id),
                  )
                }
                removable
              />
            ))}
            {selectedTabs.map((tab) => (
              <TabToken
                key={tab.id}
                onRemove={() =>
                  setSelectedTabs((current) =>
                    current.filter((item) => item.id !== tab.id),
                  )
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
                onClick={() => setSelectedFolder(undefined)}
                type="button"
              >
                ×
              </button>
            </span>
          </div>
        )}
        <Textarea
          ref={textareaRef}
          aria-label="Chat message"
          className="min-h-16 resize-none border-0 bg-transparent px-4 pb-2 pt-4 text-sm leading-6 shadow-none focus-visible:ring-0"
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
          placeholder={
            selectedAgentName
              ? `Work with ${selectedAgentName}`
              : "Ask anything..."
          }
          value={value}
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  aria-label="Browser permissions"
                  className="h-8 gap-1.5 px-2 text-[11px] text-muted-foreground"
                  size="sm"
                  variant="ghost"
                >
                  <ShieldCheck className="size-3.5" />
                  {permissionMode === "ask" ? "Ask for approval" : "Full access"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3 text-xs">
                <p className="font-medium text-foreground">
                  Browser permissions
                </p>
                <p className="mt-1 leading-5 text-muted-foreground">
                  Choose how Groubot should handle actions that can change a
                  website.
                </p>
                <button
                  className={`mt-3 flex w-full items-start gap-2 rounded-md border p-2 text-left transition ${permissionMode === "ask" ? "border-primary/50 bg-primary/10" : "border-border hover:bg-accent"}`}
                  onClick={() => onPermissionModeChange?.("ask")}
                  type="button"
                >
                  <ShieldCheck className="mt-0.5 size-3.5 text-primary" />
                  <span>
                    <span className="block font-medium">
                      Ask for approval
                    </span>
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
            className="bg-primary/20 hover:bg-primary/30 text-primary size-8 rounded-lg"
            disabled={!busy && (!value.trim() || !canSend)}
            onClick={() => {
              if (busy) onCancel();
              else void submit();
            }}
            size="icon"
          >
            <ArrowUp className={`size-4 ${busy ? "rotate-45" : ""}`} />
          </Button>
        </div>
      </div>
      <div
        className={`relative z-0 rounded-b-lg pb-1 px-1 -mt-3 mx-auto flex items-center justify-start gap-1 bg-primary/10 pt-4 ${composerWidth}`}
      >
        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label="Insert a skill"
              className="h-8 gap-1.5 px-2 text-[11px] text-muted-foreground"
              size="sm"
              variant="ghost"
            >
              <Sparkles className="size-3.5" />
              Skills
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-64 p-2">
            <p className="px-2 py-1 text-xs font-medium">Insert a skill</p>
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
              className="h-8 gap-1.5 px-2 text-[11px] text-muted-foreground"
              size="sm"
              variant="ghost"
            >
              <Globe2 className="size-3.5" />
              Tabs
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-80 p-2">
            <p className="px-2 py-1 text-xs font-medium">
              Add a tab as context
            </p>
            {tabs.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                No open tabs.
              </p>
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
                      <span className="block truncate">
                        {tab.title || "New tab"}
                      </span>
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
          className="h-8 gap-1.5 px-2 text-[11px] text-muted-foreground"
          onClick={() => folderInputRef.current?.click()}
          size="sm"
          variant="ghost"
        >
          <FolderOpen className="size-3.5" />
          Upload from computer
        </Button>
        <input
          className="hidden"
          onChange={(event) => {
            const firstFile = event.target.files?.[0];
            const folder = firstFile?.webkitRelativePath?.split("/")[0];
            setSelectedFolder(folder || undefined);
            event.target.value = "";
          }}
          ref={folderInputRef}
          type="file"
        />
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Skill, SkillInput } from "@groubot/db";
import {
  Button,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@groubot/ui";

interface SkillEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: SkillInput) => Promise<void>;
  onImportGithub: (input: {
    name: string;
    description: string;
    url: string;
  }) => Promise<void>;
}

export function SkillEditorSheet({
  open,
  onOpenChange,
  onCreate,
  onImportGithub,
}: SkillEditorSheetProps) {
  const [mode, setMode] = useState<"manual" | "import">("manual");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode("manual");
    setName("");
    setDescription("");
    setContent("");
    setGithubUrl("");
    setFileName("");
    setError("");
  }, [open]);

  async function save() {
    setError("");
    if (!name.trim() || !description.trim()) {
      setError("Add a name and short description.");
      return;
    }
    if (mode === "manual" && !content.trim()) {
      setError("Add the reusable interaction instructions.");
      return;
    }
    if (mode === "import" && !githubUrl.trim() && !content.trim()) {
      setError("Choose a Markdown file or provide a GitHub Markdown URL.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "import" && githubUrl.trim()) {
        await onImportGithub({
          name: name.trim(),
          description: description.trim(),
          url: githubUrl.trim(),
        });
      } else {
        await onCreate({
          name: name.trim(),
          description: description.trim(),
          content: content.trim(),
          creator: "You",
          source: "file",
          sourceUrl: "",
        });
      }
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the skill.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full min-w-0 gap-0 overflow-hidden p-0 sm:w-1/2"
        side="right"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-border bg-card/95 px-8 py-5 pr-16 backdrop-blur">
            <SheetTitle className="text-lg">Create a skill</SheetTitle>
            <SheetDescription className="mt-1 text-xs">
              Define a reusable interaction your agents can call later.
            </SheetDescription>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <Tabs
              value={mode}
              onValueChange={(value) => setMode(value as "manual" | "import")}
            >
              <TabsList className="w-full">
                <TabsTrigger className="flex-1" value="manual">
                  Create manually
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="import">
                  Import a skill
                </TabsTrigger>
              </TabsList>
              <div className="mt-6 grid gap-5">
                <Field label="Skill name">
                  <Input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Research a product"
                  />
                </Field>
                <Field label="Short description">
                  <Textarea
                    className="min-h-20 resize-y"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What this reusable interaction does."
                  />
                </Field>
              </div>
              <TabsContent value="manual">
                <Field label="Skill instructions">
                  <Textarea
                    className="min-h-64 resize-y"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Describe the steps, inputs, and expected result..."
                  />
                </Field>
              </TabsContent>
              <TabsContent value="import">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Markdown file</Label>
                    <input
                      accept=".md,text/markdown"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setFileName(file.name);
                        const reader = new FileReader();
                        reader.onload = () =>
                          setContent(String(reader.result ?? ""));
                        reader.readAsText(file);
                      }}
                      ref={fileInputRef}
                      type="file"
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                    >
                      {fileName || "Choose a Markdown file"}
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="github-skill-url">
                      GitHub Markdown URL
                    </Label>
                    <Input
                      id="github-skill-url"
                      onChange={(event) => setGithubUrl(event.target.value)}
                      placeholder="https://github.com/org/repo/blob/main/skill.md"
                      value={githubUrl}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use a direct HTTPS link to a .md file in a public GitHub
                      repository.
                    </p>
                  </div>
                  {content && (
                    <p className="text-xs text-muted-foreground">
                      Loaded {fileName || "Markdown content"}.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card/95 px-8 py-4 backdrop-blur">
            <span className="text-xs text-destructive">{error}</span>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => onOpenChange(false)} variant="ghost">
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Create skill"}
              </Button>
            </div>
          </footer>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

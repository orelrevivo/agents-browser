import { useEffect, useState } from "react";
import type { Agent, Conversation, Skill, SkillInput } from "@groubot/db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Skeleton,
} from "@groubot/ui";
import { Plus, Sparkles } from "lucide-react";
import { ChatSidebar } from "./ChatSidebar";
import { SkillCard } from "./SkillCard";
import { SkillEditorSheet } from "./SkillEditorSheet";

export function SkillsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Skill>();
  const [error, setError] = useState("");

  async function refresh() {
    const [nextAgents, nextSkills, nextConversations] = await Promise.all([
      window.groubot.agents.list(),
      window.groubot.skills.list(),
      window.groubot.chats.list(),
    ]);
    setAgents(nextAgents);
    setSkills(nextSkills);
    setConversations(nextConversations);
  }

  useEffect(() => {
    void refresh()
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load skills.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  async function createSkill(input: SkillInput) {
    await window.groubot.skills.create(input);
    await refresh();
  }

  async function importGithub(input: {
    name: string;
    description: string;
    url: string;
  }) {
    await window.groubot.skills.importGithub(input);
    await refresh();
  }

  async function removeSkill() {
    if (!deleteTarget) return;
    await window.groubot.skills.remove(deleteTarget.id);
    setDeleteTarget(undefined);
    await refresh();
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <ChatSidebar
        activeId={undefined}
        activeSection="skills"
        agents={agents}
        collapsed={sidebarCollapsed}
        conversations={conversations}
        onDelete={async (id) => {
          await window.groubot.chats.remove(id);
          await refresh();
        }}
        onNew={() => void window.groubot.browser.navigate("groubot://")}
        onPin={async (id, pinned) => {
          await window.groubot.chats.setPinned({ id, pinned });
          await refresh();
        }}
        onRename={async (id, title) => {
          await window.groubot.chats.rename({ id, title });
          await refresh();
        }}
        onSelect={(id) =>
          void window.groubot.browser.navigate(`groubot://chat/${id}`)
        }
        onSkills={() => undefined}
        onMarketplace={() =>
          void window.groubot.browser.navigate("groubot://marketplace")
        }
        onNewGroup={() =>
          window.dispatchEvent(new Event("groubot:new-group"))
        }
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10">
          <header className="flex flex-col gap-2 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Skills</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Create and Manage Reusable Interactions for Your Agents.
              </p>
            </div>
            <Button onClick={() => setEditorOpen(true)} className="bg-primary/20">
              <Plus className="size-4" /> Create skill
            </Button>
          </header>
          {error && (
            <p className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">My Skills</h2>
              <span className="text-xs text-muted-foreground">
                {skills.length} {skills.length === 1 ? "skill" : "skills"}
              </span>
            </div>
            {loading ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            ) : skills.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
                <Sparkles className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No skills yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a reusable interaction for your agents.
                </p>
                <Button className="mt-5 bg-primary/20" onClick={() => setEditorOpen(true)}>
                  <Plus className="size-4" /> Create skill
                </Button>
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-2">
                {skills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    onDelete={() => setDeleteTarget(skill)}
                    skill={skill}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <SkillEditorSheet
        open={editorOpen}
        onCreate={createSkill}
        onImportGithub={importGithub}
        onOpenChange={setEditorOpen}
      />
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the reusable skill from Groubot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void removeSkill()}
            >
              Delete skill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

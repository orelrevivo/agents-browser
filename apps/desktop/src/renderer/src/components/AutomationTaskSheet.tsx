import { useEffect, useMemo, useState } from "react";
import type { Agent, AutomationInput, AutomationTask, AutomationUpdate } from "@groubot/db";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Textarea,
} from "@groubot/ui";
import {
  Check,
  Clock3,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  PlayCircle,
  Trash2,
} from "lucide-react";

const taskTemplates = [
  { label: "Tell me the current time", value: "Tell me the current time." },
  {
    label: "Summarize recent chat activity",
    value: "Review the latest relevant chat activity and summarize anything I should know.",
  },
  {
    label: "Check a website for changes",
    value: "Check the requested website for meaningful changes and report what changed.",
  },
];

const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  const minute = index % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});

const fallbackTimezones = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Jerusalem",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const timezoneOptions = getTimezoneOptions();

export function AutomationTaskSheet({
  agents,
  onOpenChange,
  open,
}: {
  agents: Agent[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [editing, setEditing] = useState<AutomationTask>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(() => defaultForm());

  async function refresh() {
    try {
      setTasks(await window.groubot.automations.list());
    } catch {
      setError("Could not load automation tasks.");
    }
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  function startNew() {
    setEditing(undefined);
    setForm(defaultForm(agents[0]?.id));
    setError("");
  }

  function startEdit(task: AutomationTask) {
    setEditing(task);
    setForm({
      name: task.name,
      description: task.description,
      task: task.task,
      frequency: task.frequency,
      timeOfDay: task.timeOfDay,
      weeklyDay: String(task.weeklyDay),
      timezone: task.timezone,
      agentIds: task.agentIds,
    });
    setError("");
  }

  async function save() {
    if (!form.name.trim() || !form.task.trim() || form.agentIds.length === 0) {
      setError("Add a name, a task, and at least one agent.");
      return;
    }
    setSaving(true);
    setError("");
    const input: AutomationInput = {
      name: form.name,
      description: form.description,
      task: form.task,
      frequency: form.frequency,
      timeOfDay: form.timeOfDay,
      weeklyDay: Number(form.weeklyDay),
      timezone: form.timezone,
      agentIds: form.agentIds,
    };
    try {
      if (editing)
        await window.groubot.automations.update(editing.id, input satisfies AutomationUpdate);
      else await window.groubot.automations.create(input);
      await refresh();
      startNew();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  }

  async function runNow(task: AutomationTask) {
    try {
      await window.groubot.automations.run(task.id);
      window.dispatchEvent(new Event("groubot:conversations-changed"));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not run the task.");
    }
  }

  async function setStatus(task: AutomationTask, status: "active" | "paused") {
    try {
      await window.groubot.automations.setStatus(task.id, status);
      await refresh();
    } catch {
      setError("Could not update the task status.");
    }
  }

  async function remove(task: AutomationTask) {
    try {
      await window.groubot.automations.remove(task.id);
      if (editing?.id === task.id) startNew();
      await refresh();
    } catch {
      setError("Could not delete the task.");
    }
  }

  return (
    <Sheet
      onOpenChange={onOpenChange}
      open={open}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <div className="px-6 pt-6">
          <SheetTitle>Automation Task</SheetTitle>
          <SheetDescription>
            Schedule an agent to run a task automatically in your selected timezone.
          </SheetDescription>
        </div>
        <div className="grid gap-6 px-6 py-5">
          {tasks.length > 0 && (
            <section className="grid gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Your tasks</h3>
                  <p className="text-xs text-muted-foreground">
                    Run, pause, or edit an existing automation.
                  </p>
                </div>
                <Button
                  className="h-8 text-xs"
                  onClick={startNew}
                  variant="outline"
                >
                  New task
                </Button>
              </div>
              <div className="grid gap-2">
                {tasks.map((task) => (
                  <div
                    className="rounded-xl border border-border/70 bg-card/60 p-3"
                    key={task.id}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 size-2 shrink-0 rounded-full ${task.status === "active" ? "bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.14)]" : "bg-muted-foreground/50"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">{task.name}</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                aria-label={`Actions for ${task.name}`}
                                className="size-7 shrink-0"
                                size="icon"
                                variant="ghost"
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => void runNow(task)}>
                                <PlayCircle className="size-4" /> Run now
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  void setStatus(
                                    task,
                                    task.status === "active" ? "paused" : "active",
                                  )
                                }
                              >
                                {task.status === "active" ? (
                                  <Pause className="size-4" />
                                ) : (
                                  <Play className="size-4" />
                                )}
                                {task.status === "active" ? "Pause task" : "Resume task"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => startEdit(task)}>
                                <Pencil className="size-4" /> Edit task
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void remove(task)}
                              >
                                <Trash2 className="size-4" /> Delete task
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {task.description || task.task}
                        </p>
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Clock3 className="size-3" /> {scheduleLabel(task)} ·{" "}
                          {agentLabel(task, agents)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-4 rounded-xl border border-border/70 p-4">
            <div>
              <h3 className="text-sm font-medium">{editing ? "Edit task" : "Create a task"}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                The selected agent will receive a fresh chat session each time it runs.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="automation-name">Name</Label>
              <Input
                id="automation-name"
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Daily briefing"
                value={form.name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="automation-description">Description</Label>
              <Input
                id="automation-description"
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="A short explanation of this automation"
                value={form.description}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="automation-template">Task template</Label>
              <Select
                onValueChange={(value) => setForm((current) => ({ ...current, task: value }))}
              >
                <SelectTrigger id="automation-template">
                  <SelectValue placeholder="Choose a template or write your own" />
                </SelectTrigger>
                <SelectContent>
                  {taskTemplates.map((template) => (
                    <SelectItem
                      key={template.value}
                      value={template.value}
                    >
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                id="automation-task"
                onChange={(event) =>
                  setForm((current) => ({ ...current, task: event.target.value }))
                }
                placeholder="Describe exactly what the agent should do"
                value={form.task}
              />
            </div>
            <div className="grid gap-2">
              <Label>Frequency</Label>
              <Select
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, frequency: value as FormState["frequency"] }))
                }
                value={form.frequency}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[60]">
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.frequency === "weekly" && (
              <div className="grid gap-2">
                <Label>Day of week</Label>
                <Select
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, weeklyDay: value }))
                  }
                  value={form.weeklyDay}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[60]">
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((day, index) => (
                      <SelectItem
                        key={day}
                        value={String(index)}
                      >
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Time</Label>
                <Select
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, timeOfDay: value }))
                  }
                  value={form.timeOfDay}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[60] max-h-72">
                    {timeOptions.map((time) => (
                      <SelectItem
                        key={time}
                        value={time}
                      >
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Country / timezone</Label>
                <Select
                  onValueChange={(value) => setForm((current) => ({ ...current, timezone: value }))}
                  value={form.timezone}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[60] max-h-72">
                    {timezoneOptions.map((zone) => (
                      <SelectItem
                        key={zone}
                        value={zone}
                      >
                        {timezoneLabel(zone)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="-mt-2 text-[11px] leading-4 text-muted-foreground">
              The selected time is interpreted in the selected timezone, including daylight-saving
              changes.
            </p>
            <div className="grid gap-2">
              <Label>Agent(s)</Label>
              {agents.map((agent) => (
                <label
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                  key={agent.id}
                >
                  <Checkbox
                    checked={form.agentIds.includes(agent.id)}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        agentIds: checked
                          ? [...current.agentIds, agent.id]
                          : current.agentIds.filter((id) => id !== agent.id),
                      }))
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  {form.agentIds.includes(agent.id) && <Check className="size-4 text-primary" />}
                </label>
              ))}
            </div>
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                onClick={startNew}
                variant="ghost"
              >
                Clear
              </Button>
              <Button
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Create task"}
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type FormState = {
  name: string;
  description: string;
  task: string;
  frequency: "hourly" | "daily" | "weekly";
  timeOfDay: string;
  weeklyDay: string;
  timezone: string;
  agentIds: string[];
};

function defaultForm(agentId?: string): FormState {
  return {
    name: "",
    description: "",
    task: "",
    frequency: "daily",
    timeOfDay: "09:00",
    weeklyDay: "1",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    agentIds: agentId ? [agentId] : [],
  };
}

function getTimezoneOptions() {
  try {
    if (typeof Intl.supportedValuesOf === "function")
      return ["UTC", ...Intl.supportedValuesOf("timeZone")];
  } catch {
    /* Fall back for older Chromium builds. */
  }
  return fallbackTimezones;
}

function timezoneLabel(zone: string) {
  if (zone === "UTC") return "UTC";
  const [region, city] = zone.split("/");
  return `${region} · ${(city ?? zone).replaceAll("_", " ").replaceAll("/", " · ")}`;
}

function scheduleLabel(task: AutomationTask) {
  if (task.frequency === "hourly") return "Every hour";
  if (task.frequency === "weekly")
    return `Weekly · ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][task.weeklyDay]} at ${task.timeOfDay}`;
  return `Daily at ${task.timeOfDay}`;
}

function agentLabel(task: AutomationTask, agents: Agent[]) {
  const names = task.agentIds
    .map((id) => agents.find((agent) => agent.id === id)?.name)
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Agent unavailable";
}

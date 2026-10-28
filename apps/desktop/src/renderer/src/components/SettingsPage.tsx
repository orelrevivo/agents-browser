import { useEffect, useState } from "react";
import { Button, Separator, Switch } from "@groubot/ui";
import {
  ArrowLeft,
  Check,
  Monitor,
  Moon,
  PanelLeft,
  PanelTop,
  Settings2,
  Sun,
} from "lucide-react";

export type AppearanceTheme = "dark" | "light";
export type TabLayout = "top" | "sidebar";

interface SettingsPageProps {
  theme: AppearanceTheme;
  tabLayout: TabLayout;
  onThemeChange: (theme: AppearanceTheme) => void;
  onTabLayoutChange: (layout: TabLayout) => void;
  onBack: () => void;
}

export function SettingsPage({
  theme,
  tabLayout,
  onThemeChange,
  onTabLayoutChange,
  onBack,
}: SettingsPageProps) {
  const [compactMode, setCompactMode] = useState(false);

  useEffect(() => {
    setCompactMode(localStorage.getItem("groubot.compactMode") === "true");
  }, []);

  function updateCompactMode(enabled: boolean) {
    setCompactMode(enabled);
    localStorage.setItem("groubot.compactMode", String(enabled));
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Preferences
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Customize Groubot
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Adjust the browser shell to match the way you work. Changes are
              saved locally on this device.
            </p>
          </div>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="size-4" />
            Back to browser
          </Button>
        </header>

        <div className="mt-8 grid gap-5">
          <SettingsSection
            description="Choose the surface colors used across the browser interface."
            icon={<Settings2 className="size-4" />}
            title="Appearance"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <ThemeOption
                active={theme === "dark"}
                icon={<Moon className="size-4" />}
                label="Dark mode"
                onClick={() => onThemeChange("dark")}
              />
              <ThemeOption
                active={theme === "light"}
                icon={<Sun className="size-4" />}
                label="Light mode"
                onClick={() => onThemeChange("light")}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            description="Choose where your open browser tabs are displayed."
            icon={<Monitor className="size-4" />}
            title="Browser layout"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <LayoutOption
                active={tabLayout === "top"}
                icon={<PanelTop className="size-4" />}
                label="Tabs at the top"
                onClick={() => onTabLayoutChange("top")}
              />
              <LayoutOption
                active={tabLayout === "sidebar"}
                icon={<PanelLeft className="size-4" />}
                label="Tabs in sidebar"
                onClick={() => onTabLayoutChange("sidebar")}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            description="Small interface adjustments for compact windows."
            icon={<Monitor className="size-4" />}
            title="Interface"
          >
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 p-3">
              <div>
                <p className="text-sm font-medium">Compact controls</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use tighter spacing in the browser chrome.
                </p>
              </div>
              <Switch
                aria-label="Enable compact controls"
                checked={compactMode}
                onCheckedChange={updateCompactMode}
              />
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  children,
  description,
  icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <Separator className="my-4" />
      {children}
    </section>
  );
}

function ThemeOption({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className="h-12 justify-start border border-border px-3"
      onClick={onClick}
      variant={active ? "secondary" : "outline"}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {active && <Check className="size-4 text-primary" />}
    </Button>
  );
}

function LayoutOption({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className="h-12 justify-start border border-border px-3"
      onClick={onClick}
      variant={active ? "secondary" : "outline"}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {active && <Check className="size-4 text-primary" />}
    </Button>
  );
}

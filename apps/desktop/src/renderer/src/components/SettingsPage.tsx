import { useEffect, useState } from "react";
import { Button, Separator, Switch } from "@groubot/ui";
import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Monitor,
  Moon,
  PanelLeft,
  PanelTop,
  Settings2,
  Sun,
  Trash2,
  Upload,
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
  const [customBackground, setCustomBackground] = useState<string | null>(() =>
    localStorage.getItem("groubot.customBackground"),
  );

  useEffect(() => {
    setCompactMode(localStorage.getItem("groubot.compactMode") === "true");
  }, []);

  function updateCompactMode(enabled: boolean) {
    setCompactMode(enabled);
    localStorage.setItem("groubot.compactMode", String(enabled));
  }

  function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCustomBackground(result);
      localStorage.setItem("groubot.customBackground", result);
      window.dispatchEvent(new Event("groubot:background-changed"));
    };
    reader.readAsDataURL(file);
  }

  function removeCustomBackground() {
    setCustomBackground(null);
    localStorage.removeItem("groubot.customBackground");
    window.dispatchEvent(new Event("groubot:background-changed"));
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Preferences
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Customize Groubot</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Adjust the browser shell to match the way you work. Changes are saved locally on this
              device.
            </p>
          </div>
          <Button
            onClick={onBack}
            variant="outline"
          >
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
            description="Customize the wallpaper displayed behind the home chat workspace. By default, the wallpaper adapts automatically to dark and light mode."
            icon={<ImageIcon className="size-4" />}
            title="Chat Background"
          >
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Custom Background Image</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {customBackground
                      ? "Custom background is currently active."
                      : "Default theme wallpaper is active (changes between dark and light mode)."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <span className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-transparent px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                      <Upload className="size-4" />
                      {customBackground ? "Change Image" : "Upload Image"}
                    </span>
                  </label>
                  {customBackground && (
                    <Button
                      onClick={removeCustomBackground}
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                      Reset to Default
                    </Button>
                  )}
                </div>
              </div>
              {customBackground && (
                <div className="relative mt-2 h-32 w-full max-w-sm overflow-hidden rounded-lg border border-border">
                  <img
                    src={customBackground}
                    alt="Custom background preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
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
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
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

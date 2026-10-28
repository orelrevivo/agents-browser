import { useState } from "react";
import { Globe2 } from "./icons";

export function TabIcon({
  kind,
  faviconUrl,
}: {
  kind: string;
  faviconUrl?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showFavicon = kind === "web" && Boolean(faviconUrl) && !failed;

  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] ${kind === "home" ? "bg-primary/15 text-primary" : "bg-accent text-muted-foreground"}`}
    >
      {showFavicon ? (
        <img
          alt=""
          className="size-3.5 rounded-sm object-contain"
          onError={() => setFailed(true)}
          src={faviconUrl}
        />
      ) : (
        <Globe2 className="size-3.5" />
      )}
    </span>
  );
}

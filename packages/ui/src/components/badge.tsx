import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors", { variants: { variant: { default: "border-transparent bg-primary/15 text-primary", secondary: "border-transparent bg-secondary text-secondary-foreground", outline: "text-foreground", muted: "border-transparent bg-muted text-muted-foreground" } }, defaultVariants: { variant: "default" } });
export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) { return <div className={cn(badgeVariants({ variant }), className)} {...props} />; }

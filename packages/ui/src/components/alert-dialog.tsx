import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../lib/utils";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogOverlay = AlertDialogPrimitive.Overlay;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export function AlertDialogContent({ className, ...props }: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>) { return <AlertDialogPrimitive.Portal><AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" /><AlertDialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-2xl", className)} {...props} /></AlertDialogPrimitive.Portal>; }
export function AlertDialogHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) { return <div className={cn("flex flex-col gap-2 text-left", className)} {...props} />; }
export function AlertDialogFooter({ className, ...props }: ComponentPropsWithoutRef<"div">) { return <div className={cn("mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />; }
export function AlertDialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>) { return <AlertDialogPrimitive.Title className={cn("text-lg font-semibold", className)} {...props} />; }
export function AlertDialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>) { return <AlertDialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />; }

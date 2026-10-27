import * as ToastPrimitive from "@radix-ui/react-toast"
import { X } from "lucide-react"
import type { ComponentPropsWithoutRef, ReactNode } from "react"

import { cn } from "../lib/utils"

const ToastProvider = ToastPrimitive.Provider

function ToastViewport({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>) {
  return <ToastPrimitive.Viewport className={cn("fixed right-0 top-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:max-w-[420px]", className)} {...props} />
}

function Toast({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Root>) {
  return <ToastPrimitive.Root className={cn("group pointer-events-auto relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-lg border border-border bg-card p-4 pr-8 text-card-foreground shadow-xl transition-all data-[state=closed]:animate-out data-[state=open]:animate-in", className)} {...props} />
}

function ToastTitle({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Title>) {
  return <ToastPrimitive.Title className={cn("text-sm font-semibold", className)} {...props} />
}

function ToastDescription({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Description>) {
  return <ToastPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function ToastClose({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Close>) {
  return <ToastPrimitive.Close className={cn("absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring group-hover:opacity-100", className)} toast-close="" {...props}><X className="size-4" /></ToastPrimitive.Close>
}

function ToastAction({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Action>) {
  return <ToastPrimitive.Action className={cn("inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-transparent px-3 text-xs font-medium hover:bg-accent", className)} {...props} />
}

function Toaster({ children }: { children?: ReactNode }) {
  return <ToastProvider>{children}<ToastViewport /></ToastProvider>
}

export { Toast, ToastAction, ToastClose, ToastDescription, ToastProvider, Toaster, ToastTitle, ToastViewport }

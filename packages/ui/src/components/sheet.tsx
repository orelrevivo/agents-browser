import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
export function SheetContent({ className, side = "right", children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "top" | "right" | "bottom" | "left" }) { return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-sheet-fade-out data-[state=open]:animate-sheet-fade-in" /><DialogPrimitive.Content className={cn("fixed z-50 flex flex-col gap-4 border bg-card shadow-xl outline-none", side === "right" && "inset-y-0 right-0 h-full w-full border-l data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in sm:w-1/2", side === "left" && "inset-y-0 left-0 h-full w-full border-r sm:w-1/2", side === "top" && "inset-x-0 top-0 border-b", side === "bottom" && "inset-x-0 bottom-0 border-t", className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-5 top-5 z-10 rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"><X className="h-4 w-4" /><span className="sr-only">Close</span></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>; }

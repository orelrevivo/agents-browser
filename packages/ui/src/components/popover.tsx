import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, align = "center", sideOffset = 4, ...props }: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) { return <PopoverPrimitive.Portal><PopoverPrimitive.Content align={align} sideOffset={sideOffset} className={cn("z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none", className)} {...props} /></PopoverPrimitive.Portal>; }

"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={6}
        align="end"
        className={cn("z-50 min-w-44 rounded-brand border border-border bg-white p-1 shadow-lg", className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn("flex cursor-pointer select-none items-center gap-2 rounded-[3px] px-2.5 py-2 text-sm text-grey-900 outline-none hover:bg-grey-100 focus:bg-grey-100 data-[disabled]:opacity-50", className)}
      {...props}
    />
  );
}

export const DropdownMenuSeparator = () => <DropdownMenuPrimitive.Separator className="my-1 h-px bg-border" />;
export const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => (
  <DropdownMenuPrimitive.Label className="px-2.5 py-1.5 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">{children}</DropdownMenuPrimitive.Label>
);

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={6}
        align="end"
        className={cn("z-50 w-72 rounded-brand border border-border bg-white p-3 shadow-lg", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { sendGAEvent } from "@next/third-parties/google";
import { cn } from "@/lib/utils";

/**
 * McMaster web button spec: Poppins SemiBold, 4px radius, primary maroon → gold hover,
 * secondary outlined, tertiary = icon + text with no box.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-brand font-heading font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-maroon text-white hover:bg-gold hover:text-ink",
        secondary: "border border-maroon bg-white text-maroon hover:bg-gold hover:border-gold hover:text-ink",
        tertiary: "bg-transparent text-maroon underline-offset-4 hover:underline px-0",
        ghost: "bg-transparent text-grey-800 hover:bg-grey-100",
        danger: "bg-danger text-white hover:bg-[#8a1f25]",
        gold: "bg-gold text-ink hover:bg-maroon hover:text-white",
        outline: "border border-border bg-white text-grey-800 hover:bg-grey-100",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-[15px]",
        lg: "h-12 px-6 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, onClick, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), variant === "tertiary" && "h-auto", className);
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      sendGAEvent("event", "button_click", { button_variant: variant ?? "primary" });
      onClick?.(event);
    };

    if (asChild) {
      // Slot requires exactly one element child; loading state is not supported here.
      return (
        <Slot className={classes} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button className={classes} ref={ref} disabled={disabled || loading} {...props} onClick={handleClick}>
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

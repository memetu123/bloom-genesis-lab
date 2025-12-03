import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Todayoum Button Variants
 * - default: Solid olive green background, white text
 * - outline: Olive green outline, transparent background
 * - secondary: Sand/neutral background
 * - ghost: Transparent with hover state
 * - link: Text only with underline on hover
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-calm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* Primary: Solid olive green with white text */
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85",
        /* Destructive */
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/85",
        /* Outline: Olive green border, transparent background */
        outline:
          "border border-primary bg-transparent text-primary hover:bg-primary/5 active:bg-primary/10",
        /* Secondary: Neutral/sand background */
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        /* Ghost: Transparent with subtle hover */
        ghost:
          "hover:bg-muted hover:text-foreground active:bg-muted/80",
        /* Link: Text only */
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-md px-4 text-sm",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
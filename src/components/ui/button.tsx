import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "d-inline-d-flex align-items-center justify-content-center gap-2 text-nowrap rounded-md fw-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
        secondary:
          "bg-slate-100 text-slate-900 shadow-sm hover:bg-slate-200",
        destructive:
          "bg-red-600 text-white shadow-sm hover:bg-red-700",
        outline:
          "border border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 hover:text-slate-900",
        edit:
          "border border-blue-600 bg-white text-blue-600 hover:bg-blue-50",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        link: "text-emerald-600 underline-offset-4 hover:underline",
        success:
          "bg-green-500 text-white shadow-sm hover:bg-green-600",
        warning:
          "bg-amber-500 text-white shadow-sm hover:bg-amber-600",
      },
      size: {
        default: "h-10 px-4 py-2 fs-sm",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-5 fs-sm",
        icon: "h-10 w-10 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };


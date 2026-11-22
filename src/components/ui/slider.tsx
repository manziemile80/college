import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("position-relative d-flex w-100 touch-none select-none align-items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="position-relative h-2 w-100 grow overflow-d-none rounded-circle bg-slate-200">
      <SliderPrimitive.Range className="position-absolute h-100 bg-emerald-600" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="d-block h-5 w-5 rounded-circle border-2 border-emerald-600 bg-white ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };


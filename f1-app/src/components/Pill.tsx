import type { ReactNode, AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type Size = "sm" | "md" | "lg";
type Variant = "outline" | "inverted";

interface Common {
  active?: boolean;
  size?: Size;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

type PillProps =
  | (Common & { as?: "button" } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">)
  | (Common & { as: "a" } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className">);

export default function Pill(props: PillProps) {
  const { active, size = "md", variant = "outline", children, className, ...rest } = props as any;
  const classes = [
    "pill",
    size === "sm" && "pill--sm",
    size === "lg" && "pill--lg",
    variant === "inverted" && "pill--inverted",
    active && "pill--active",
    className,
  ].filter(Boolean).join(" ");

  if ((props as any).as === "a") {
    return <a {...rest} className={classes}>{children}</a>;
  }
  return <button {...rest} className={classes}>{children}</button>;
}

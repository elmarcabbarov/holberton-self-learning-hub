import { useEffect, useState, type ComponentProps, type InputHTMLAttributes, type ReactNode } from "react";
import logoStacked from "../assets/brand/holberton-hub-stacked.svg?raw";
import logoInline from "../assets/brand/holberton-hub-inline.svg?raw";

export function Button({ variant = "secondary", className = "", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    // Disabled primary keeps a neutral look instead of washed-out pink (opacity on red).
    primary: "bg-brand text-white hover:bg-brand-dark border-transparent disabled:bg-surface-2 disabled:text-muted disabled:border-line disabled:opacity-100",
    secondary: "bg-surface text-fg border-fg/80 hover:bg-fg hover:text-bg disabled:hover:bg-surface disabled:hover:text-fg",
    ghost: "bg-transparent text-muted border-transparent hover:text-fg hover:bg-surface-2",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border px-4 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function TextInput({ label, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-fg">{label}</span>
      <input
        {...props}
        className="h-10 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px] text-fg placeholder:text-muted focus:border-fg focus:outline-none focus-visible:outline-2"
      />
    </label>
  );
}

/** Holberton Self-Learning Hub lockup (D-069). The SVGs are our own build files; colour via currentColor. */
export function Logo({ variant = "stacked", className = "" }: { variant?: "stacked" | "inline"; className?: string }) {
  return <span className={`hub-logo ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: variant === "inline" ? logoInline : logoStacked }} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-card)] border border-line bg-surface p-6 md:p-7 ${className}`}>{children}</div>;
}

export function PageTitle({ children, id }: { children: ReactNode; id?: string }) {
  return <h1 id={id} className="text-[36px] leading-tight">{children}</h1>;
}

/**
 * Two-step destructive action without a modal: first click arms it, second click confirms.
 * Disarms itself after 4 seconds or on blur.
 */
export function ConfirmButton({ onConfirm, children, confirmLabel, ariaLabel, confirmAriaLabel }: {
  onConfirm: () => void; children: ReactNode; confirmLabel: ReactNode; ariaLabel?: string; confirmAriaLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);
  return (
    <Button
      variant={armed ? "primary" : "ghost"}
      aria-label={armed ? confirmAriaLabel : ariaLabel}
      onBlur={() => setArmed(false)}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

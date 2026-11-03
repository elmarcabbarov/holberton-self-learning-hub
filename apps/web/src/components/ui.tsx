import { useEffect, useState, type ComponentProps, type InputHTMLAttributes, type ReactNode } from "react";

export function Button({ variant = "secondary", className = "", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark border-transparent",
    secondary: "bg-surface-2 text-fg border-line hover:bg-surface",
    ghost: "bg-transparent text-muted border-transparent hover:text-fg hover:bg-surface-2",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border px-4 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function TextInput({ label, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] text-muted">{label}</span>
      <input
        {...props}
        className="h-10 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-[15px] text-fg placeholder:text-muted"
      />
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-card)] border border-line bg-surface p-6 md:p-8 ${className}`}>{children}</div>;
}

export function PageTitle({ children, id }: { children: ReactNode; id?: string }) {
  return <h1 id={id} className="text-[32px] font-medium tracking-tight">{children}</h1>;
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

import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-surface hover:bg-ink-soft disabled:bg-muted',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-soft',
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink',
  danger: 'bg-surface text-gap border border-line hover:border-gap',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  busy?: boolean;
  size?: 'md' | 'lg' | 'sm';
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', busy, size = 'md', icon, className = '', children, disabled, ...rest },
  ref,
) {
  const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-[15px] gap-2' };
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center rounded-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-9 items-center justify-center rounded-[10px] text-ink-soft transition-colors hover:bg-sunken hover:text-ink ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, className = '', ...rest }, ref) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={hint || error ? `${id}-note` : undefined}
        className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-focus focus:outline-none aria-[invalid]:border-gap"
        {...rest}
      />
      {(error || hint) && (
        <p id={`${id}-note`} className={`mt-1.5 text-[12.5px] ${error ? 'text-gap' : 'text-muted'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'error' | 'warn';
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: 'bg-sunken text-ink-soft',
    error: 'bg-gap-bg text-ink',
    warn: 'bg-partial-bg text-ink',
  };
  const Icon = tone === 'info' ? Info : AlertTriangle;
  const iconTone = tone === 'error' ? 'text-gap' : tone === 'warn' ? 'text-partial' : 'text-muted';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl p-3.5 ${tones[tone]}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${iconTone}`} aria-hidden />
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        {action && <div className="mt-2.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</section>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

/** Small ruler mark used as the brand glyph. */
export function TapeGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="1" y="6" width="22" height="12" rx="2.5" fill="var(--tape)" />
      <path d="M5 6v5M9 6v3M13 6v5M17 6v3M21 6v5" stroke="var(--tape-ink)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

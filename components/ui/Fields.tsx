"use client";

import { useId, useState } from "react";

interface BaseFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  error?: string;
  optional?: boolean;
  placeholder?: string;
}

function describedBy(helpId: string | null, errorId: string | null): string | undefined {
  const ids = [helpId, errorId].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function TextField({ label, value, onChange, help, error, optional, placeholder }: BaseFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : null;
  const errorId = error ? `${id}-error` : null;

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional ? <span className="optional">(optional)</span> : null}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-describedby={describedBy(helpId, errorId)}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? (
        <span className="help" id={helpId ?? undefined}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={errorId ?? undefined} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

interface NumberFieldProps extends BaseFieldProps {
  prefix?: string;
  suffix?: string;
  step?: string;
  min?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  help,
  error,
  optional,
  placeholder,
  prefix,
  suffix,
  step = "any",
  min = "0",
}: NumberFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : null;
  const errorId = error ? `${id}-error` : null;

  const input = (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value}
      placeholder={placeholder}
      aria-describedby={describedBy(helpId, errorId)}
      aria-invalid={error ? true : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );

  const wrapperClass = prefix ? "input-with-prefix" : "input-with-suffix";

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional ? <span className="optional">(optional)</span> : null}
      </label>
      {prefix || suffix ? (
        <div className={`${wrapperClass}${error ? " invalid" : ""}`}>
          {prefix ? <span className="affix" aria-hidden="true">{prefix}</span> : null}
          {input}
          {suffix ? <span className="affix" aria-hidden="true">{suffix}</span> : null}
        </div>
      ) : (
        input
      )}
      {help ? (
        <span className="help" id={helpId ?? undefined}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={errorId ?? undefined} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

interface SelectFieldProps extends Omit<BaseFieldProps, "placeholder"> {
  options: { value: string; label: string }[];
}

export function SelectField({ label, value, onChange, options, help, error, optional }: SelectFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : null;
  const errorId = error ? `${id}-error` : null;

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional ? <span className="optional">(optional)</span> : null}
      </label>
      <select
        id={id}
        value={value}
        aria-describedby={describedBy(helpId, errorId)}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {help ? (
        <span className="help" id={helpId ?? undefined}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={errorId ?? undefined} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

interface SectionProps {
  step?: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}

export function Section({ step, title, note, children }: SectionProps) {
  const headingId = useId();

  return (
    <section className="section" aria-labelledby={headingId}>
      <div className="section-heading">
        {step ? <span className="section-step">{step}</span> : null}
        <h2 id={headingId}>{title}</h2>
      </div>
      {note ? <p className="section-note">{note}</p> : null}
      {children}
    </section>
  );
}

interface DisclosureProps {
  summary: React.ReactNode;
  /** Holds the panel open regardless of what the user clicked. */
  forceOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Extra detail stays folded away until it is wanted. `forceOpen` is how a field
 * with a validation error pulls itself back into view: a message the contractor
 * cannot see is worse than an extra open panel.
 */
export function Disclosure({ summary, forceOpen = false, children, className }: DisclosureProps) {
  const [opened, setOpened] = useState(false);

  return (
    <details
      className={`disclosure${className ? ` ${className}` : ""}`}
      open={opened || forceOpen}
      onToggle={(event) => setOpened(event.currentTarget.open)}
    >
      <summary>{summary}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

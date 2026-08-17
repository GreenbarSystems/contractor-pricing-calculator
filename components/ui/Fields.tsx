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

interface ControlProps {
  id: string;
  describedBy: string | undefined;
  invalid: true | undefined;
}

interface FieldShellProps {
  label: string;
  help?: string;
  error?: string;
  optional?: boolean;
  children: (control: ControlProps) => React.ReactNode;
}

/**
 * Owns everything every field shares: the generated id, the label, the help
 * text, the error message, and the wiring that ties them together for screen
 * readers. Each field type only has to render its own control.
 */
function FieldShell({ label, help, error, optional, children }: FieldShellProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional ? <span className="optional">(optional)</span> : null}
      </label>
      {children({ id, describedBy, invalid: error ? true : undefined })}
      {help ? (
        <span className="help" id={helpId}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextField({ label, value, onChange, help, error, optional, placeholder }: BaseFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}

interface NumberFieldProps extends BaseFieldProps {
  prefix?: string;
  suffix?: string;
  step?: string;
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
}: NumberFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} optional={optional}>
      {({ id, describedBy, invalid }) => {
        const input = (
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step={step}
            min="0"
            value={value}
            placeholder={placeholder}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(event) => onChange(event.target.value)}
          />
        );

        if (!prefix && !suffix) return input;

        return (
          <div
            className={`${prefix ? "input-with-prefix" : "input-with-suffix"}${invalid ? " invalid" : ""}`}
          >
            {prefix ? (
              <span className="affix" aria-hidden="true">
                {prefix}
              </span>
            ) : null}
            {input}
            {suffix ? (
              <span className="affix" aria-hidden="true">
                {suffix}
              </span>
            ) : null}
          </div>
        );
      }}
    </FieldShell>
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

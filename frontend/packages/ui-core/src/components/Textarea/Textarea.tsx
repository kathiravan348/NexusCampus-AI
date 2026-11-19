import * as React from "react";
import { cn } from "../../lib/cn";
import { Field, getDescribedBy } from "../Field/Field";

export interface TextareaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id"
> {
  id?: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
  required?: boolean;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      id,
      label,
      description,
      error,
      required,
      rows = 3,
      containerClassName,
      className,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;
    const hasError = Boolean(error);
    const hasDescription = Boolean(description);
    const describedBy = getDescribedBy(textareaId, hasDescription, hasError);

    return (
      <Field
        label={label}
        htmlFor={textareaId}
        description={description}
        error={error}
        required={required}
        className={containerClassName}
      >
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          required={required}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={[ariaDescribedBy, describedBy].filter(Boolean).join(" ") || undefined}
          className={cn(
            "w-full rounded-md border bg-bg-surface px-3 py-2 font-sans text-body text-text-primary placeholder:text-text-muted transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-ground",
            "disabled:pointer-events-none disabled:opacity-50",
            hasError ? "border-danger" : "border-border-strong",
            className,
          )}
          {...props}
        />
      </Field>
    );
  },
);

Textarea.displayName = "Textarea";

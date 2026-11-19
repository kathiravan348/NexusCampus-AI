import * as React from "react";
import { useText } from "@nexus/i18n";
import { cn } from "../../lib/cn";
import { DEFAULT_COLORS, isHexColor } from "../../theme/contrast";
import { Field, getDescribedBy } from "../Field/Field";

export interface ColorFieldProps {
  id?: string;
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  description?: React.ReactNode;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  pickerAriaLabel?: string;
  trailingAction?: React.ReactNode;
  containerClassName?: string;
  className?: string;
}

const FALLBACK_PICKER_COLOR = DEFAULT_COLORS.light["brand-primary"] ?? "";

export const ColorField = React.forwardRef<HTMLInputElement, ColorFieldProps>(
  (
    {
      id,
      label,
      value,
      onChange,
      description,
      error,
      disabled = false,
      readOnly = false,
      required = false,
      placeholder,
      pickerAriaLabel,
      trailingAction,
      containerClassName,
      className,
    },
    ref,
  ) => {
    const t = useText();
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const hasError = Boolean(error);
    const hasDescription = Boolean(description);
    const describedBy = getDescribedBy(inputId, hasDescription, hasError);
    const validHex = isHexColor(value);
    const lastValidRef = React.useRef<string>(validHex ? value : FALLBACK_PICKER_COLOR);
    if (validHex) lastValidRef.current = value;

    const pickerDisabled = disabled || readOnly;
    const resolvedPickerLabel =
      pickerAriaLabel ?? (typeof label === "string" ? label : t("common.colorPicker"));

    return (
      <Field
        label={label}
        htmlFor={inputId}
        description={description}
        error={error}
        required={required}
        className={containerClassName}
      >
        <div className="flex items-center gap-2">
          <span
            data-testid={`${inputId}-swatch`}
            className={cn(
              "relative h-10 w-10 shrink-0 overflow-hidden rounded-md border bg-bg-raised transition-colors",
              hasError ? "border-danger" : "border-border-strong",
              pickerDisabled ? "opacity-50" : "cursor-pointer",
              "has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg-ground",
            )}
            style={validHex ? { backgroundColor: value } : undefined}
          >
            <input
              type="color"
              value={lastValidRef.current.toLowerCase()}
              disabled={pickerDisabled}
              aria-label={resolvedPickerLabel}
              onChange={(event) => onChange(event.target.value.toUpperCase())}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </span>

          <input
            ref={ref}
            id={inputId}
            type="text"
            dir="ltr"
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            aria-invalid={hasError ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            className={cn(
              "h-10 min-w-0 flex-1 rounded-md border bg-bg-surface px-3 font-mono text-body uppercase text-text-primary placeholder:text-text-muted transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-ground",
              "disabled:pointer-events-none disabled:opacity-50",
              hasError ? "border-danger" : "border-border-strong",
              className,
            )}
          />

          {trailingAction && <div className="shrink-0">{trailingAction}</div>}
        </div>
      </Field>
    );
  },
);

ColorField.displayName = "ColorField";

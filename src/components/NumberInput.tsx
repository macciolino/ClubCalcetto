'use client';

import React, { useEffect, useRef, useState } from 'react';

type NativeProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'
>;

interface NumberInputProps extends NativeProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Decimals allowed (e.g. costs). Default: integers only. */
  decimal?: boolean;
  /** Value used when the field is left empty. Default: min, or 0. */
  emptyValue?: number;
}

/**
 * Numeric field that works well on phones:
 * - the field can be emptied while typing (no "stuck 0");
 * - tapping it selects the current value, so typing replaces it;
 * - numeric keyboard, comma accepted as decimal separator;
 * - min/max are applied when leaving the field, not while typing.
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  decimal = false,
  emptyValue,
  onFocus,
  onBlur,
  ...rest
}: NumberInputProps) {
  const [text, setText] = useState(() => String(value));
  const focused = useRef(false);

  // Follow external changes when the user is not editing
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  const parse = (raw: string): number | null => {
    const normalized = raw.replace(',', '.').trim();
    if (normalized === '' || normalized === '-' || normalized === '.') return null;
    const n = decimal ? parseFloat(normalized) : parseInt(normalized, 10);
    return Number.isFinite(n) ? n : null;
  };

  const clamp = (n: number) => {
    let v = n;
    if (typeof min === 'number') v = Math.max(min, v);
    if (typeof max === 'number') v = Math.min(max, v);
    return v;
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        const allowed = decimal ? /^-?\d*[.,]?\d*$/ : /^-?\d*$/;
        if (!allowed.test(raw)) return;
        setText(raw);
        const n = parse(raw);
        if (n !== null) onValueChange(n);
      }}
      onBlur={(e) => {
        focused.current = false;
        const n = parse(text);
        const finalValue = clamp(n ?? emptyValue ?? min ?? 0);
        setText(String(finalValue));
        if (finalValue !== value || n === null) onValueChange(finalValue);
        onBlur?.(e);
      }}
    />
  );
}

import { useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Employee } from './domain';

export default function EmployeePicker({
  employees,
  value,
  disabled,
  onChange,
}: {
  employees: Employee[];
  value: string;
  disabled: boolean;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = employees.find((e) => e.code === value);
  const matches = employees.filter((e) =>
    `${e.name} ${e.code}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const options = query.trim() ? matches : [{ code: '', name: 'All employees' }, ...matches];
  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setQuery('');
    trigger.current?.focus();
  }
  return (
    <div
      className="employee-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label id={`${id}-label`}>Employee</label>
      <button
        ref={trigger}
        type="button"
        className="employee-picker-trigger"
        aria-label="Select document employee"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setQuery('');
          setIndex(0);
        }}
      >
        <span>
          {selected ? (
            <>
              <strong>{selected.name}</strong>
              <small>{selected.code}</small>
            </>
          ) : (
            'Select an employee to upload or view documents'
          )}
        </span>
        <ChevronDown size={17} />
      </button>
      {open && (
        <div className="employee-picker-panel" id={`${id}-panel`}>
          <div className="employee-search-control">
            <Search size={17} aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-label="Find employee by name or code"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={`${id}-list`}
              aria-activedescendant={options[index] ? `${id}-option-${index}` : undefined}
              placeholder="Search name or employee code"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setIndex((i) => Math.min(i + 1, options.length - 1));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setIndex((i) => Math.max(i - 1, 0));
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (options[index]) choose(options[index].code);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setOpen(false);
                  trigger.current?.focus();
                }
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear employee search"
                onClick={() => {
                  setQuery('');
                  setIndex(0);
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div
            className="employee-picker-options"
            role="listbox"
            aria-labelledby={`${id}-label`}
            id={`${id}-list`}
          >
            {options.map((e, i) => (
              <button
                type="button"
                role="option"
                aria-selected={value === e.code}
                id={`${id}-option-${i}`}
                key={e.code}
                className={i === index ? 'highlighted' : ''}
                ref={(node) => {
                  if (i === index && node) node.scrollIntoView({ block: 'nearest' });
                }}
                onClick={() => choose(e.code)}
              >
                <span>
                  <strong>{e.name}</strong>
                  <small>{e.code || 'View all documents'}</small>
                </span>
                {value === e.code && <Check size={16} />}
              </button>
            ))}
            {!matches.length && (
              <p className="employee-picker-empty">No employees match. Try another name or code.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

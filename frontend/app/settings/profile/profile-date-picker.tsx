'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ProfileDatePickerProps = {
  id: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = Array.from({ length: 12 }, (_, index) => index);

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : null;
}

function toDateValue(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDate(value: string) {
  const date = parseDate(value);
  return date
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    : '';
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function ProfileDatePicker({
  id,
  value,
  invalid,
  describedBy,
  onChange,
}: ProfileDatePickerProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const oldestDate = useMemo(
    () =>
      new Date(
        today.getFullYear() - 121,
        today.getMonth(),
        today.getDate() + 1,
      ),
    [today],
  );
  const selectedDate = parseDate(value);
  const initialView = selectedDate ?? today;
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const years = useMemo(
    () =>
      Array.from(
        { length: today.getFullYear() - oldestDate.getFullYear() + 1 },
        (_, index) => today.getFullYear() - index,
      ),
    [oldestDate, today],
  );

  const openCalendar = () => {
    const nextView = selectedDate ?? today;
    setViewYear(nextView.getFullYear());
    setViewMonth(nextView.getMonth());
    setOpen(true);
  };

  const closeCalendar = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Node &&
        !controlRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeCalendar();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    window.setTimeout(() => {
      calendarRef.current
        ?.querySelector<HTMLButtonElement>(
          '[data-selected="true"], [data-today="true"], button:not([disabled])',
        )
        ?.focus();
    }, 0);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const previousMonth = new Date(viewYear, viewMonth - 1, 1);
  const nextMonth = new Date(viewYear, viewMonth + 1, 1);
  const previousDisabled =
    new Date(viewYear, viewMonth, 0).getTime() < oldestDate.getTime();
  const nextDisabled =
    nextMonth.getTime() >
    new Date(today.getFullYear(), today.getMonth(), 1).getTime();

  const moveToMonth = (date: Date) => {
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
  };

  const chooseDay = (day: number) => {
    onChange(toDateValue(viewYear, viewMonth, day));
    closeCalendar();
  };

  return (
    <div ref={controlRef} className="profile-date-control">
      <input
        ref={triggerRef}
        id={id}
        className="profile-date-trigger"
        type="text"
        role="combobox"
        readOnly
        value={formatDate(value)}
        placeholder="请选择出生日期"
        aria-label={
          value ? `出生日期，${formatDate(value)}` : '出生日期，尚未选择'
        }
        aria-haspopup="dialog"
        aria-controls={`${id}-calendar`}
        aria-expanded={open}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={() => {
          if (!open) openCalendar();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          openCalendar();
        }}
      />
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7 2v3M17 2v3M3.5 9h17M5.5 4h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      </svg>

      {open ? (
        <div
          id={`${id}-calendar`}
          ref={calendarRef}
          className="profile-date-popover"
          role="dialog"
          aria-modal="false"
          aria-label="选择出生日期"
        >
          <div className="profile-date-heading">
            <button
              type="button"
              aria-label="上一个月"
              disabled={previousDisabled}
              onClick={() => moveToMonth(previousMonth)}
            >
              ‹
            </button>
            <div>
              <select
                aria-label="出生年份"
                value={viewYear}
                onChange={(event) => setViewYear(Number(event.target.value))}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}年
                  </option>
                ))}
              </select>
              <select
                aria-label="出生月份"
                value={viewMonth}
                onChange={(event) => setViewMonth(Number(event.target.value))}
              >
                {MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {month + 1}月
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              aria-label="下一个月"
              disabled={nextDisabled}
              onClick={() => moveToMonth(nextMonth)}
            >
              ›
            </button>
          </div>

          <div className="profile-date-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="profile-date-grid" role="grid">
            {Array.from({ length: firstWeekday }, (_, index) => (
              <span key={`empty-${index}`} aria-hidden="true" />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const date = new Date(viewYear, viewMonth, day);
              const disabled = date < oldestDate || date > today;
              const selected = selectedDate
                ? sameDay(date, selectedDate)
                : false;
              const isToday = sameDay(date, today);
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-label={`${viewYear}年${viewMonth + 1}月${day}日`}
                  aria-selected={selected}
                  data-selected={selected}
                  data-today={isToday}
                  disabled={disabled}
                  onClick={() => chooseDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="profile-date-footer">
            <button
              type="button"
              disabled={!value}
              onClick={() => {
                onChange('');
                closeCalendar();
              }}
            >
              清除日期
            </button>
            <button type="button" onClick={closeCalendar}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

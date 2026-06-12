import { useMemo, useState, type KeyboardEvent } from "react";
import type { CachedPitcher } from "../api";
import { countLabel } from "../text";

const IMMEDIATE_SUGGESTION_LIMIT = 8;
const LARGE_CACHE_MIN_QUERY_LENGTH = 2;
const MAX_VISIBLE_OPTIONS = 8;

type PitcherComboboxProps = {
  disabled?: boolean;
  formatDate: (value: string) => string;
  formatPersonName: (value: string | null | undefined) => string;
  id?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onSelect: (pitcher: CachedPitcher) => void;
  pitchers: CachedPitcher[];
  placeholder?: string;
  value: string;
};

function PitcherCombobox({
  disabled = false,
  formatDate,
  formatPersonName,
  id,
  onBlur,
  onChange,
  onSelect,
  pitchers,
  placeholder = "Choose a cached pitcher",
  value,
}: PitcherComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedValue = value.trim().toLowerCase();
  const requiresQuery = pitchers.length > IMMEDIATE_SUGGESTION_LIMIT;
  const hasEnoughQuery = !requiresQuery || normalizedValue.length >= LARGE_CACHE_MIN_QUERY_LENGTH;
  const options = useMemo(() => {
    if (!hasEnoughQuery) return [];

    const rankedPitchers = [...pitchers].sort((a, b) => b.pitch_count - a.pitch_count);
    const matches = normalizedValue
      ? rankedPitchers.filter((pitcher) => {
          const displayName = formatPersonName(pitcher.player_name).toLowerCase();
          const rawName = pitcher.player_name.toLowerCase();
          return displayName.includes(normalizedValue) || rawName.includes(normalizedValue);
        })
      : rankedPitchers;

    return matches.slice(0, MAX_VISIBLE_OPTIONS);
  }, [formatPersonName, hasEnoughQuery, normalizedValue, pitchers]);
  const listboxId = id ? `${id}-listbox` : undefined;
  const queryHint =
    LARGE_CACHE_MIN_QUERY_LENGTH - normalizedValue.length === 1
      ? "Type 1 more character to search cached pitchers."
      : `Type ${LARGE_CACHE_MIN_QUERY_LENGTH - normalizedValue.length} characters to search cached pitchers.`;

  function selectPitcher(pitcher: CachedPitcher) {
    onSelect(pitcher);
    setIsOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setIsOpen(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && isOpen && options[activeIndex]) {
      event.preventDefault();
      selectPitcher(options[activeIndex]);
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div
      className="pitcher-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
          onBlur?.();
        }
      }}
    >
      <input
        aria-activedescendant={isOpen && options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        autoComplete="off"
        disabled={disabled}
        id={id}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        type="text"
        value={value}
      />
      {isOpen && !disabled ? (
        <div className="pitcher-combobox-menu" id={listboxId} role="listbox">
          {!hasEnoughQuery ? (
            <div className="pitcher-combobox-empty">{queryHint}</div>
          ) : options.length > 0 ? (
            options.map((pitcher, index) => (
              <button
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? "pitcher-combobox-option is-active"
                    : "pitcher-combobox-option"
                }
                id={listboxId ? `${listboxId}-option-${index}` : undefined}
                key={pitcher.pitcher}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectPitcher(pitcher)}
                role="option"
                type="button"
              >
                <span>
                  <strong>{formatPersonName(pitcher.player_name)}</strong>
                  <small>{countLabel(pitcher.pitch_count, "pitch")}</small>
                </span>
                <em>
                  {formatDate(pitcher.first_game_date)} to {formatDate(pitcher.last_game_date)}
                </em>
              </button>
            ))
          ) : (
            <div className="pitcher-combobox-empty">No cached pitchers matched.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default PitcherCombobox;

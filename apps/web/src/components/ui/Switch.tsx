/** Interruptor do design (trilho 40×22; `size="lg"` = 48×28). */
export function Switch({
  checked,
  onChange,
  label,
  size = 'md',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  size?: 'md' | 'lg';
}) {
  const lg = size === 'lg';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full border-0 ${lg ? 'h-7 w-12 p-[3px]' : 'h-[22px] w-10 p-0.5'}`}
      style={{ background: checked ? 'var(--accent)' : 'var(--line2)' }}
    >
      <span
        className={`block rounded-full bg-white transition-transform duration-150 ${lg ? 'h-[22px] w-[22px]' : 'h-[18px] w-[18px]'}`}
        style={{ transform: `translateX(${checked ? (lg ? 20 : 18) : 0}px)` }}
      />
    </button>
  );
}

/** Botão-pílula de filtro (Todos / Meus / root). */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="h-8 rounded-full border px-3 text-[13px] font-medium"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--line2)',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text2)',
      }}
    >
      {children}
    </button>
  );
}

/** Controle segmentado (24h / 7 dias / 30 dias; Confortável / Compacta). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = 'bg-panel',
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-0.5 rounded-[10px] border border-line p-[3px] ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-lg border-0 px-3.5 text-[13px] font-medium ${
            o.value === value ? 'bg-panel2 text-text' : 'bg-transparent text-text3'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Campo de busca com a lupa à esquerda. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = 'w-full h-[42px] text-sm',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text3">⌕</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`rounded-[10px] border border-line2 bg-panel pl-[34px] pr-3 ${className}`}
      />
    </label>
  );
}

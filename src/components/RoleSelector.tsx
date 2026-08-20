import { ROLES, type Role } from '../domain/types';

const roleMeta: Record<Role, { label: string; glyph: string }> = {
  TOP: { label: 'Top', glyph: '⌃' },
  JUNGLE: { label: 'Jungle', glyph: '⌁' },
  MID: { label: 'Mid', glyph: '◇' },
  ADC: { label: 'ADC', glyph: '⊙' },
  SUPPORT: { label: 'Support', glyph: '✦' },
};

export function RoleGlyph({ role, size = 'medium' }: { role: Role; size?: 'small' | 'medium' | 'large' }) {
  return (
    <span className={`role-glyph role-glyph--${size} role-glyph--${role.toLowerCase()}`} aria-hidden="true">
      {roleMeta[role].glyph}
    </span>
  );
}

interface RoleSelectorProps {
  label: string;
  hint: string;
  value: Role;
  excluded?: Role;
  onChange(role: Role): void;
}

export function RoleSelector({ label, hint, value, excluded, onChange }: RoleSelectorProps) {
  return (
    <section className="role-select">
      <div className="role-select__heading">
        <div>
          <span className="eyebrow">{label}</span>
          <h3>{roleMeta[value].label}</h3>
        </div>
        <RoleGlyph role={value} size="large" />
      </div>
      <p>{hint}</p>
      <div className="role-grid" role="radiogroup" aria-label={label}>
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={value === role}
            disabled={role === excluded}
            className={value === role ? 'role-option role-option--active' : 'role-option'}
            onClick={() => onChange(role)}
          >
            <RoleGlyph role={role} />
            <span>{roleMeta[role].label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

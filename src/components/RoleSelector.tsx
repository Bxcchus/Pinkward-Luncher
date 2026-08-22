import type { ReactNode } from 'react';
import { ROLES, type Role } from '../domain/types';

const roleMeta: Record<Role, { label: string; detail: string; viewBox: string; glyph: ReactNode }> = {
  TOP: {
    label: 'Top',
    detail: 'Solo lane · pressure',
    viewBox: '1275 341 271 266',
    glyph: <>
      <path d="M1445.96 509.581L1374.72 509.581L1374.72 438.349L1445.96 438.349L1445.96 509.581Z" fill="currentColor" opacity=".15" />
      <path d="M1514.94 341H1275V580.943L1327.24 528.707V390.862H1465.08L1514.94 341Z" fill="currentColor" opacity=".15" />
      <path d="M1359.32 557.068L1493.44 557.068L1493.44 422.943L1545.68 370.706V606.93L1309.46 606.93L1359.32 557.068Z" fill="currentColor" opacity=".15" />
      <path d="M1514.94 341H1275V580.943L1327.24 528.707V390.862H1465.08L1514.94 341Z" fill="currentColor" />
    </>,
  },
  JUNGLE: {
    label: 'Jungle',
    detail: 'Map control · tempo',
    viewBox: '0 0 265 297',
    glyph: <>
      <path d="M153.147 142.463C158.846 153.86 161.853 169.372 162.645 175.704L175.704 144.837C174.912 142.463 173.804 132.965 175.704 113.97C177.603 94.9751 201.031 31.6584 212.507 2.37438C202.614 15.8292 180.453 46.3004 170.955 60.5466C161.458 74.7929 145.628 104.473 138.901 117.532C141.275 121.093 147.449 131.066 153.147 142.463Z" fill="currentColor" />
      <path d="M192.325 231.502C185.676 237.2 176.891 247.331 173.33 251.684L172.142 217.256C173.33 212.507 176.416 200.635 179.266 191.137C182.115 181.64 189.95 161.458 205.384 134.152C209.341 128.216 220.58 113.258 229.127 105.66C237.675 98.0618 251.684 89.0392 264.743 81.916C246.935 102.098 249.31 99.7239 232.689 129.404C219.16 153.563 216.86 191.533 217.256 213.694C211.715 217.256 198.973 225.803 192.325 231.502Z" fill="currentColor" />
      <path d="M144.837 211.32C144.837 256.908 136.922 287.3 132.965 296.797C102.573 251.209 63.3167 220.817 47.4875 211.32C46.3004 197.073 42.7388 164.069 37.99 146.024C33.2413 127.979 10.6847 95.7666 0 81.916C10.6847 86.6648 36.5654 100.199 54.6107 116.344C72.656 132.49 85.0819 157.896 89.0392 168.581C89.0392 157.5 88.3268 129.166 85.4776 104.473C82.6283 79.7791 61.3381 24.5352 51.0491 0C60.1509 13.8505 78.3545 35.6157 92.6007 60.5466C102.404 77.702 144.837 154.335 144.837 211.32Z" fill="currentColor" />
    </>,
  },
  MID: {
    label: 'Mid',
    detail: 'Central lane · roam',
    viewBox: '1255 16 291 266',
    glyph: <>
      <path d="M1255.7 16H1456.93L1407.07 65.8619H1307.94V164.991L1255.7 217.227V16Z" fill="currentColor" opacity=".15" />
      <path d="M1325.3 281.93H1526.38V80.8484L1474.15 133.085V232.068H1375.16L1325.3 281.93Z" fill="currentColor" opacity=".15" />
      <path fillRule="evenodd" clipRule="evenodd" d="M1526.38 59.2903L1303.74 281.93H1255.7V238.785L1478.49 16H1526.38V59.2903Z" fill="currentColor" />
    </>,
  },
  ADC: {
    label: 'Bot',
    detail: 'Ranged carry · scaling',
    viewBox: '397 16 271 266',
    glyph: <>
      <path d="M496.922 113.349H568.153V184.581H496.922V113.349Z" fill="currentColor" opacity=".15" />
      <path d="M427.934 281.93H667.877V41.9871L615.641 94.2234V232.068H477.796L427.934 281.93Z" fill="currentColor" opacity=".15" />
      <path d="M583.56 65.8619H449.434V199.988L397.198 252.224V16H633.422L583.56 65.8619Z" fill="currentColor" opacity=".15" />
      <path d="M427.934 281.93H667.877V41.9871L615.641 94.2234V232.068H477.796L427.934 281.93Z" fill="currentColor" />
    </>,
  },
  SUPPORT: {
    label: 'Support',
    detail: 'Vision · protection',
    viewBox: '800 13 324 271',
    glyph: <>
      <path d="M949.918 106.788L960.603 121.034L972.475 106.788L1000.97 251.625L960.603 283.679L922.613 251.625L949.918 106.788Z" fill="currentColor" />
      <path d="M1008.09 167.335L986.721 98.4776L1018.77 66.4235L1123.25 69.9851C1118.5 75.1295 1106.39 85.8934 1095.94 92.5416C1085.49 99.1899 1071.01 106.788 1057.95 107.975H1030.65L1057.95 147.152L1008.09 167.335Z" fill="currentColor" />
      <path d="M960.603 90.1673L911.928 34.3694L922.613 13H1000.97L1010.46 34.3694L960.603 90.1673Z" fill="currentColor" />
      <path d="M933.297 98.4776L904.805 69.9851H800.332C804.289 73.1509 807.455 83.0441 831.199 94.916C849.576 104.105 864.836 108.371 868.002 107.975H891.746L864.44 147.152L915.489 167.335L933.297 98.4776Z" fill="currentColor" />
    </>,
  },
};

export function RoleGlyph({ role, size = 'medium' }: { role: Role; size?: 'small' | 'medium' | 'large' }) {
  return (
    <span className={`role-glyph role-glyph--${size} role-glyph--${role.toLowerCase()}`} aria-hidden="true">
      <svg viewBox={roleMeta[role].viewBox} fill="none">
        {roleMeta[role].glyph}
      </svg>
    </span>
  );
}

interface RoleSelectorProps {
  primaryRole: Role;
  secondaryRole: Role;
  disabled?: boolean;
  onPrimaryChange(role: Role): void;
  onSecondaryChange(role: Role): void;
}

function RoleOption({ role, value, pairedRole, swapTarget, disabled, onChange }: { role: Role; value: Role; pairedRole: Role; swapTarget: string; disabled: boolean; onChange(role: Role): void }) {
  const active = value === role;
  const willSwap = pairedRole === role;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${roleMeta[role].label}${willSwap ? `, swap with ${swapTarget}` : ''}`}
      title={willSwap ? `Swap with ${swapTarget}` : roleMeta[role].detail}
      disabled={disabled}
      className={`role-option${active ? ' role-option--active' : ''}${willSwap ? ' role-option--swap' : ''}`}
      onClick={() => onChange(role)}
    >
      <RoleGlyph role={role} size="large" />
      {active && <span className="role-option__lock" aria-hidden="true"><LockGlyph /></span>}
    </button>
  );
}

export function RoleLoadout({ primaryRole, secondaryRole, disabled = false, onPrimaryChange, onSecondaryChange }: RoleSelectorProps) {
  return (
    <div className="role-matrix">
      <div className="role-matrix__corner" aria-hidden="true" />
      {ROLES.map((role) => <div className="role-matrix__column" key={role}><strong>{roleMeta[role].label}</strong><i /></div>)}
      <div className="role-matrix__row-label role-matrix__row-label--primary"><strong>Primary</strong><i /></div>
      <div className="role-matrix__options" role="radiogroup" aria-label="PRIMARY">
        {ROLES.map((role) => <RoleOption key={role} role={role} value={primaryRole} pairedRole={secondaryRole} swapTarget="secondary" disabled={disabled} onChange={onPrimaryChange} />)}
      </div>
      <div className="role-matrix__row-label role-matrix__row-label--secondary"><strong>Secondary</strong><i /></div>
      <div className="role-matrix__options" role="radiogroup" aria-label="SECONDARY">
        {ROLES.map((role) => <RoleOption key={role} role={role} value={secondaryRole} pairedRole={primaryRole} swapTarget="primary" disabled={disabled} onChange={onSecondaryChange} />)}
      </div>
    </div>
  );
}

function LockGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="6" y="10" width="12" height="10" /><path d="M9 10V7a3 3 0 0 1 6 0v3M12 14v3" /></svg>;
}

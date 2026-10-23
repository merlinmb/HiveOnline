import { BugGlyph } from './BugIcon';
import { hexCorners } from '../../shared/hex';

export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <polygon points={hexCorners(50, 50, 48)} fill="#e7b34a" />
      <polygon points={hexCorners(50, 50, 40)} fill="none" stroke="#a97a1f" strokeWidth="2" opacity="0.65" />
      <g transform="translate(23 23) scale(0.54)" style={{ color: '#20170a' }}>
        <BugGlyph bug="queen" />
      </g>
    </svg>
  );
}

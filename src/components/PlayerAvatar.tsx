import type { CSSProperties } from 'react';
import { avatarHue, initials } from '../lib/format';

export function PlayerAvatar({
  name,
  size = 44,
  isGuest = false,
  isBot = false,
  className = '',
}: {
  name: string;
  size?: number;
  isGuest?: boolean;
  isBot?: boolean;
  className?: string;
}) {
  const style = {
    '--avatar-hue': avatarHue(name),
    width: size,
    height: size,
    fontSize: Math.max(11, Math.round(size * 0.34)),
  } as CSSProperties;

  return (
    <span
      className={`avatar ${isGuest ? 'avatar-guest' : ''} ${isBot ? 'avatar-bot' : ''} ${className}`}
      style={style}
      aria-hidden="true"
    >
      {isBot ? 'AI' : initials(name)}
    </span>
  );
}

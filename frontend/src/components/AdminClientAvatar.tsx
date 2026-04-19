import React, { useState } from 'react';

type Props = {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'h-9 w-9 text-[10px]',
  md: 'h-12 w-12 text-xs',
  lg: 'h-16 w-16 text-sm',
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const w = parts[0] ?? '';
  if (w.length >= 2) return w.slice(0, 2).toUpperCase();
  return w.slice(0, 1).toUpperCase() || '?';
}

/** Avatar de cliente (foto de Google o iniciales). */
export default function AdminClientAvatar({ name, avatarUrl, size = 'md', className = '' }: Props) {
  const [imgError, setImgError] = useState(false);
  const showImg = Boolean(avatarUrl?.trim()) && !imgError;
  const initials = initialsFromName(name);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-zinc-200 ring-1 ring-zinc-200/80 ${sizeClasses[size]} ${className}`}
    >
      {showImg ? (
        <img
          src={avatarUrl!.trim()}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-bold text-zinc-600">{initials}</span>
      )}
    </div>
  );
}

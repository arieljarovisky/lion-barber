import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { AdminClientWithHistory } from '../api';
import { displayClientEmail } from '../utils/manualClientEmail';

function clientPhones(client: AdminClientWithHistory): string[] {
  if (Array.isArray(client.phones) && client.phones.length > 0) {
    return client.phones.filter((p) => p.trim().length > 0);
  }
  if (client.phone?.trim()) return [client.phone.trim()];
  return [];
}

function matchesClientQuery(client: AdminClientWithHistory, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    client.name.toLowerCase().includes(q) ||
    client.email.toLowerCase().includes(q) ||
    clientPhones(client).some((p) => p.toLowerCase().includes(q))
  );
}

export interface ClientSearchInputProps {
  clients: AdminClientWithHistory[];
  value: string;
  onChange: (clientId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  getSubtitle?: (client: AdminClientWithHistory) => string | undefined;
}

export default function ClientSearchInput({
  clients,
  value,
  onChange,
  placeholder = 'Buscar cliente…',
  disabled = false,
  getSubtitle,
}: ClientSearchInputProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selectedClient = useMemo(
    () => (value ? clients.find((c) => String(c.id) === value) : undefined),
    [clients, value]
  );

  useEffect(() => {
    if (selectedClient) {
      setQuery(selectedClient.name);
    } else if (!value) {
      setQuery('');
    }
  }, [selectedClient, value]);

  const filteredClients = useMemo(() => {
    const q = query.trim();
    if (!q) return clients.slice(0, 12);
    return clients.filter((c) => matchesClientQuery(c, q)).slice(0, 12);
  }, [clients, query]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        if (selectedClient) setQuery(selectedClient.name);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [selectedClient]);

  const handleQueryChange = (next: string) => {
    setQuery(next);
    setOpen(true);
    if (selectedClient && next.trim() !== selectedClient.name) {
      onChange('');
    }
  };

  const handleSelect = (client: AdminClientWithHistory) => {
    onChange(String(client.id));
    setQuery(client.name);
    setOpen(false);
  };

  const showDropdown = open && !disabled && (query.trim().length > 0 || clients.length > 0);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          className="w-full rounded-lg border border-violet-200 bg-white py-2 pl-9 pr-3 text-sm disabled:opacity-50"
        />
      </div>
      {showDropdown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-violet-200 bg-white py-1 shadow-lg"
        >
          {filteredClients.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500">Sin resultados</li>
          ) : (
            filteredClients.map((c) => {
              const subtitle = getSubtitle?.(c) ?? displayClientEmail(c.email);
              const selected = String(c.id) === value;
              return (
                <li key={c.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(c)}
                    className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-violet-50 ${
                      selected ? 'bg-violet-50' : ''
                    }`}
                  >
                    <span className="font-semibold text-zinc-900">{c.name}</span>
                    {subtitle ? <span className="text-[11px] text-zinc-500">{subtitle}</span> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

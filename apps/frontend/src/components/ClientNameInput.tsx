import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User } from 'lucide-react';
import { clientsApi } from '../services/clients';

/**
 * Free-text pilot name field with suggestions drawn from previously stored
 * clients (`GET /clients?search=`) — picking a suggestion or just typing a
 * new name both work, the backend finds-or-creates the Client row when the
 * pod is actually sent (see `dedicated-servers.controller.ts#join`).
 */
export function ClientNameInput({
  value,
  onChange,
  placeholder = 'Nom du pilote',
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(t);
  }, [value]);

  const { data: suggestions } = useQuery({
    queryKey: ['clients', 'search', debounced],
    queryFn: () => clientsApi.search(debounced),
    enabled: open && debounced.trim().length > 0,
  });

  const filtered = (suggestions ?? []).filter(
    (c) => c.name.toLowerCase() !== value.trim().toLowerCase(),
  );

  return (
    <div className="relative">
      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-dark-600 bg-dark-900 py-2.5 pl-9 pr-3 font-semibold uppercase tracking-wide text-white placeholder-gray-600 placeholder:normal-case placeholder:tracking-normal placeholder:font-normal focus:border-accent-orange focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-dark-600 bg-dark-800 shadow-xl">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c.name);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-gray-200 hover:bg-dark-700 hover:text-white"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

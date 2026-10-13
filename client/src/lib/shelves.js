import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/** The reader's shelves ("My Shelf" first) with helpers to change them. */
export function useShelves() {
  const [shelves, setShelves] = useState(null);

  const load = useCallback(() => api('/shelves').then((d) => setShelves(d.shelves)), []);
  useEffect(() => {
    load().catch(() => setShelves([]));
  }, [load]);

  const toggle = useCallback(async (shelf, bookId) => {
    const on = shelf.book_ids.includes(bookId);
    setShelves((all) =>
      all.map((s) => (s.id === shelf.id ? { ...s, book_ids: on ? s.book_ids.filter((b) => b !== bookId) : [bookId, ...s.book_ids] } : s)),
    );
    await api(`/shelves/${shelf.id}/books/${bookId}`, { method: on ? 'DELETE' : 'PUT' });
  }, []);

  const create = useCallback(async (name, bookId) => {
    const { shelf } = await api('/shelves', { method: 'POST', body: { name, book_id: bookId } });
    setShelves((all) => [...all, shelf]);
    return shelf;
  }, []);

  const rename = useCallback(async (shelf, name) => {
    await api(`/shelves/${shelf.id}`, { method: 'PATCH', body: { name } });
    setShelves((all) => all.map((s) => (s.id === shelf.id ? { ...s, name } : s)));
  }, []);

  const remove = useCallback(async (shelf) => {
    await api(`/shelves/${shelf.id}`, { method: 'DELETE' });
    setShelves((all) => all.filter((s) => s.id !== shelf.id));
  }, []);

  return { shelves, toggle, create, rename, remove, reload: load };
}

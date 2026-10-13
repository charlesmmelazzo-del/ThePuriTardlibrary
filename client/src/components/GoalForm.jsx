import { useState } from 'react';
import { addDays, api, formatDate, today } from '../lib/api.js';

const PRESETS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 91 },
  { label: '6 months', days: 182 },
  { label: '1 year', days: 365 },
];

/** Pick a finish date for a book. Calls onSaved(goalStatus). */
export default function GoalForm({ bookId, remaining, onSaved, onCancel }) {
  const [days, setDays] = useState(30);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const target = custom || addDays(today(), days - 1);
  const daysCount = custom
    ? Math.max(1, Math.round((new Date(`${custom}T00:00`) - new Date(`${today()}T00:00`)) / 86400000) + 1)
    : days;
  const perDay = remaining ? Math.ceil(remaining / daysCount) : 0;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { goal } = await api('/goals', { method: 'POST', body: { book_id: bookId, target_date: target, today: today() } });
      onSaved(goal);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="goal-form">
      <div className="chip-row" role="radiogroup" aria-label="Finish within">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            role="radio"
            aria-checked={!custom && days === p.days}
            className={`chip ${!custom && days === p.days ? 'active' : ''}`}
            onClick={() => {
              setCustom('');
              setDays(p.days);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="inline">
        or pick a date
        <input type="date" min={today()} value={custom} onChange={(e) => setCustom(e.target.value)} />
      </label>
      <p className="muted">
        Finish by <strong>{formatDate(target)}</strong>
        {remaining > 0 && (
          <>
            {' '}
            · about <strong>{perDay}</strong> paragraph{perDay === 1 ? '' : 's'} a day
          </>
        )}
        . If you miss a day, your daily amount adjusts so you can catch up.
      </p>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Set goal'}
        </button>
        {onCancel && (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

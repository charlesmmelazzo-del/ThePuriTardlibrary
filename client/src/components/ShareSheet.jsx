import { useMemo, useState } from 'react';
import { useApp } from '../lib/auth.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/**
 * Share a paragraph as a quoted excerpt via the device share sheet, text message, email or clipboard.
 * `paragraph` has { original, modern }; `source` has { title, author, year, chapter, section }.
 */
export default function ShareSheet({ paragraph, source, initialVersion = 'modern', onClose }) {
  const { config } = useApp();
  const [version, setVersion] = useState(paragraph.modern ? initialVersion : 'original');
  const [status, setStatus] = useState('');

  const text = useMemo(() => {
    const body =
      version === 'both'
        ? `“${paragraph.original}”\n\nIn modern English:\n“${paragraph.modern}”`
        : `“${version === 'original' ? paragraph.original : paragraph.modern}”`;
    const cite = [source.author, source.title].filter(Boolean).join(', ') + (source.year ? ` (${source.year})` : '');
    const where = [source.chapter, source.section].filter(Boolean).join(' · ');
    return `${body}\n\n— ${cite}${where ? `\n${where}` : ''}\n\nShared from ${config.appName}: ${window.location.origin}`;
  }, [version, paragraph, source, config.appName]);

  const subject = `An excerpt from ${source.title}`;
  const canShare = typeof navigator.share === 'function';

  return (
    <Modal title="Share this excerpt" onClose={onClose}>
      {paragraph.modern && paragraph.original && (
        <div className="segmented" role="radiogroup" aria-label="Version to share">
          {[
            ['modern', 'Modern'],
            ['original', 'Original'],
            ['both', 'Both'],
          ].map(([v, label]) => (
            <button key={v} role="radio" aria-checked={version === v} className={version === v ? 'active' : ''} onClick={() => setVersion(v)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <pre className="share-preview">{text}</pre>
      <div className="share-actions">
        {canShare && (
          <button
            className="btn primary"
            onClick={async () => {
              try {
                await navigator.share({ title: subject, text });
                onClose();
              } catch {
                /* cancelled */
              }
            }}
          >
            <Icon name="share" size={18} /> Share…
          </button>
        )}
        <a className="btn" href={`sms:?&body=${encodeURIComponent(text)}`}>
          <Icon name="message" size={18} /> Text message
        </a>
        <a className="btn" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>
          <Icon name="mail" size={18} /> Email
        </a>
        <button
          className="btn"
          onClick={async () => setStatus((await copyText(text)) ? 'Copied to clipboard.' : 'Could not copy. Select the text above instead.')}
        >
          <Icon name="copy" size={18} /> Copy
        </button>
      </div>
      {status && <p className="muted small" role="status">{status}</p>}
    </Modal>
  );
}

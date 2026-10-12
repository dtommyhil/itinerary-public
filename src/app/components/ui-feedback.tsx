'use client';
import { useEffect, useState } from 'react';
const eventName = 'itinerary:notice';
export function notifySaved(message: string) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: message }));
}
export function UiFeedback() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function show(event: Event) {
      const text = (event as CustomEvent<unknown>).detail;
      if (typeof text !== 'string') return;
      clearTimeout(timer);
      setMessage(text);
      timer = setTimeout(() => setMessage(''), 3000);
    }
    window.addEventListener(eventName, show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(eventName, show);
    };
  }, []);
  return (
    <div className="reference-ui ui-feedback">
      <div
        id="toast"
        className={message ? 'visible' : ''}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </div>
  );
}

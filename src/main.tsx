import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
const root = document.getElementById('root')!;
// Numeric values must never change accidentally while scrolling a form.
// A non-passive native listener also works for inputs inside modal dialogs.
root.addEventListener(
  'wheel',
  (event) => {
    const input = event.target;
    if (
      input instanceof HTMLInputElement &&
      input.type === 'number' &&
      document.activeElement === input
    ) {
      event.preventDefault();
    }
  },
  { passive: false, capture: true },
);
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

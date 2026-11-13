import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../app';
import '../index.css';
import { AvisoDemo } from './aviso';

// Entrada del modo demo: el mismo panel, más el aviso fijo de la demo.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <AvisoDemo />
  </StrictMode>,
);

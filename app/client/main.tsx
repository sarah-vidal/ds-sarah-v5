import { createRoot } from 'react-dom/client';
import App from './App.js';
import { applyVars, loadTokens } from './studio/model.js';
import './fonts.css';
import './styles.css';

// Les aperçus lisent des variables CSS : elles existent avant le premier rendu.
applyVars(loadTokens());

createRoot(document.getElementById('root')!).render(<App />);

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

console.log('React mount start');

const root = createRoot(document.getElementById('root'));
root.render(<App />);

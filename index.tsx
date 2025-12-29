import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log("CatalogForge: Studio Engine Initializing...");

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("CatalogForge: Root element missing from DOM.");
} else {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("CatalogForge: Studio Engine Mounted.");
}
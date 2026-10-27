// Apply the saved theme before the first paint to avoid a flash.
// Kept as an external file so the production CSP can use `script-src 'self'`.
(() => {
  try {
    const stored = localStorage.getItem('hive-theme');
    const theme = stored === 'light' || stored === 'dark' ? stored : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();

/** Entry point: styles + app bootstrap. */
import './css/styles.css';
import { startApp } from './app.js';

startApp().catch((error) => {
  // Last-resort failure screen; details stay in the console only.
  console.error(error);
  const root = document.getElementById('app');
  if (root) root.innerHTML = '<div class="boot-screen"><p class="text-ink">Trackademia failed to start. Please reload the page.</p></div>';
});

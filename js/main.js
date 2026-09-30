import { unlock } from './crypto.js';

const form = document.getElementById('gate-form');
const input = document.getElementById('gate-input');
const btn = document.getElementById('gate-btn');
const error = document.getElementById('gate-error');
const card = document.querySelector('.gate-card');

input.focus();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!input.value.trim()) return;
  btn.disabled = true; btn.textContent = 'Unlocking…'; error.textContent = '';
  try {
    const data = await unlock(input.value);
    if (!data) {
      error.textContent = "That code didn't work. Try again!";
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      return;
    }
    btn.textContent = 'Building the island…';
    const { start } = await import('./game.js');
    await start(data);
    document.getElementById('gate').hidden = true;
  } catch (err) {
    console.error(err);
    error.textContent = 'Something went wrong loading the game. Please refresh.';
  } finally {
    btn.disabled = false; btn.textContent = 'Set sail ⛵';
  }
});

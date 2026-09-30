const statusEl = document.getElementById('status')!;
const button = document.getElementById('grant') as HTMLButtonElement;

async function grant(): Promise<void> {
  button.disabled = true;
  statusEl.className = '';
  statusEl.textContent = 'Waiting for your permission…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop()); // we only wanted the permission, not the audio
    statusEl.className = 'ok';
    statusEl.textContent = 'Microphone enabled. You can close this tab and press the mic button in the SightLite panel.';
  } catch (e) {
    const name = e instanceof DOMException ? e.name : 'Error';
    statusEl.className = 'err';
    statusEl.textContent =
      name === 'NotAllowedError'
        ? 'Permission was blocked. Allow microphone access for SightLite in your browser site permissions, then try again.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Plug one in and try again.'
          : `Could not access the microphone (${name}).`;
    button.disabled = false;
  }
}

button.addEventListener('click', () => void grant());
export {};

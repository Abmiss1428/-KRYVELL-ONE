(() => {
  const reveal = () => {
    const boot = document.getElementById('boot');
    const os = document.getElementById('os');
    if (boot) boot.hidden = true;
    if (os) os.hidden = false;
  };

  // Fail-open: KRYVELL OS must never stay trapped on the boot screen.
  window.addEventListener('error', reveal, { once: true });
  window.addEventListener('unhandledrejection', reveal, { once: true });
  setTimeout(reveal, 1400);
})();

(() => {
  const cleanEscapedNewlines = () => {
    if (!document.body) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const parent = node.parentElement;
      if (parent?.closest('script,style,textarea,pre,code')) continue;

      const before = node.nodeValue || '';
      const after = before.replace(/(^|\\s)\\\\n(?=\\s|$)/g, '$1');

      if (after !== before) node.nodeValue = after;
    }
  };

  const reveal = () => {
    cleanEscapedNewlines();

    const boot = document.getElementById('boot');
    const os = document.getElementById('os');
    if (boot) boot.hidden = true;
    if (os) os.hidden = false;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanEscapedNewlines, { once: true });
  } else {
    cleanEscapedNewlines();
  }

  // Fail-open: KRYVELL OS must never stay trapped on the boot screen.
  window.addEventListener('error', reveal, { once: true });
  window.addEventListener('unhandledrejection', reveal, { once: true });
  setTimeout(reveal, 1400);
})();

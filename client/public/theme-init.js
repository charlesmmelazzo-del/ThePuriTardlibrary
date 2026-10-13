// Apply the saved theme before the app loads to avoid a flash of the wrong colors.
(function () {
  try {
    var t = localStorage.getItem('pl-theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();

// Вкладки, которые появятся на следующих этапах.
(function (PF) {
  'use strict';

  function placeholder(title, iconName, text) {
    return {
      title,
      render(el) {
        el.innerHTML =
          '<header class="top"><h1>' + PF.t(title) + '</h1></header>' +
          '<div class="placeholder">' + PF.ui.icon(iconName, 'big') + '<p>' + PF.t(text) + '</p></div>';
      },
    };
  }

  PF.screens = PF.screens || {};
  PF.screens.stats = placeholder('Статистика', 'stats', 'Графики и итоги появятся на этапе 6.');
})(window.PF);

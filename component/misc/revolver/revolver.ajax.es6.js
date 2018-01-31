(function ($) {
  Drupal.Ajax.prototype.setProgressIndicatorThrobber = function () {
    this.progress.element = $('<span class="revolver revolver--disabled">' + Drupal.t('Loading…') + '</span>');
    if (this.progress.message) {
      this.progress.element.html(this.progress.message);
    }
    setTimeout(() => {
      this.progress.element.removeClass('revolver--disabled')
    }, 1);
    $(this.element).after(this.progress.element);
  };
})(jQuery);
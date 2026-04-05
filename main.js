(function () {
  "use strict";

  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Плавный скролл для якорей (без ломания history) */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (e) {
      var id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      history.pushState(null, "", id);
    });
  });

  /* Hero: появление строк заголовка */
  var heroLines = document.querySelectorAll("[data-hero-line]");
  if (heroLines.length && !reduced) {
    heroLines.forEach(function (el, i) {
      el.style.setProperty("--delay", String(i * 0.12) + "s");
      el.classList.add("hero-line--animate");
    });
  } else {
    heroLines.forEach(function (el) {
      el.classList.add("hero-line--visible");
    });
  }

  var heroRest = document.querySelectorAll("[data-hero-rest]");
  if (heroRest.length) {
    window.setTimeout(
      function () {
        heroRest.forEach(function (el) {
          el.classList.add("is-visible");
        });
      },
      reduced ? 0 : 650
    );
  }

  /* Секции при скролле */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window) || reduced) {
    revealEls.forEach(function (el) {
      el.classList.add("is-revealed");
    });
  } else {
    var io = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          obs.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -40px 0px", threshold: 0.08 }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  }

  /*
   * Заявка: статусы «Обработка» → «Заявка принята» и переход в nomad-dashboard.html.
   * На Netlify fetch(POST) на index.html часто даёт 404 — отправляем форму в скрытый iframe
   * (нативный POST на action="thank-you.html", как задумано у Netlify Forms).
   * Локально — имитация успеха без сети.
   */
  var quoteForm = document.querySelector('form[name="gonzo-quote"]');
  if (quoteForm) {
    var isLocalDev =
      location.protocol === "file:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1";

    var statusBox = document.getElementById("quote-status");
    var phaseProcessing = document.getElementById("quote-status-processing");
    var phaseAccepted = document.getElementById("quote-status-accepted");
    var phaseError = document.getElementById("quote-status-error");
    var submitBtn = document.getElementById("gq-submit");
    var retryBtn = document.getElementById("quote-retry");

    var minProcessingMs = 1400;

    function showPhase(which) {
      if (!statusBox) return;
      [phaseProcessing, phaseAccepted, phaseError].forEach(function (el) {
        if (!el) return;
        el.classList.add("hidden");
      });
      if (which === "processing" && phaseProcessing) phaseProcessing.classList.remove("hidden");
      if (which === "accepted" && phaseAccepted) phaseAccepted.classList.remove("hidden");
      if (which === "error" && phaseError) phaseError.classList.remove("hidden");
      statusBox.classList.remove("hidden");
      if (which === "processing") {
        statusBox.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
      }
    }

    function hideStatus() {
      if (!statusBox) return;
      statusBox.classList.add("hidden");
      [phaseProcessing, phaseAccepted, phaseError].forEach(function (el) {
        if (el) el.classList.add("hidden");
      });
    }

    function setSubmitting(busy) {
      if (!submitBtn) return;
      submitBtn.disabled = !!busy;
      submitBtn.setAttribute("aria-busy", busy ? "true" : "false");
    }

    function afterMinDelay(startedAt, fn) {
      var elapsed = Date.now() - startedAt;
      var wait = Math.max(0, minProcessingMs - elapsed);
      window.setTimeout(fn, wait);
    }

    function submitQuote() {
      var startedAt = Date.now();
      showPhase("processing");
      setSubmitting(true);

      function goAccepted() {
        afterMinDelay(startedAt, function () {
          showPhase("accepted");
          setSubmitting(false);
        });
      }

      function goError() {
        afterMinDelay(startedAt, function () {
          showPhase("error");
          setSubmitting(false);
        });
      }

      if (isLocalDev) {
        window.setTimeout(function () {
          goAccepted();
        }, 400);
        return;
      }

      var iframeName = "gonzo-netlify-" + String(Date.now());
      var iframe = document.createElement("iframe");
      iframe.name = iframeName;
      iframe.setAttribute("aria-hidden", "true");
      iframe.title = "Отправка заявки";
      iframe.style.cssText =
        "position:absolute;left:-9999px;width:1px;height:1px;border:0;opacity:0;pointer-events:none";

      var savedTarget = quoteForm.getAttribute("target");
      var loads = 0;
      var finished = false;
      var timeoutId = window.setTimeout(function () {
        cleanup();
        goError();
      }, 28000);

      function cleanup() {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeoutId);
        iframe.removeEventListener("load", onIframeLoad);
        if (savedTarget == null || savedTarget === "") {
          quoteForm.removeAttribute("target");
        } else {
          quoteForm.setAttribute("target", savedTarget);
        }
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }

      function onIframeLoad() {
        loads += 1;
        var path = "";
        var href = "";
        try {
          path = iframe.contentWindow.location.pathname || "";
          href = iframe.contentWindow.location.href || "";
        } catch (err) {
          path = "";
          href = "";
        }
        if (/thank-you/i.test(path) || /thank-you/i.test(href)) {
          cleanup();
          goAccepted();
          return;
        }
        if (loads >= 2) {
          cleanup();
          goError();
        }
      }

      iframe.addEventListener("load", onIframeLoad);
      document.body.appendChild(iframe);
      quoteForm.setAttribute("target", iframeName);
      quoteForm.submit();
    }

    quoteForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (typeof quoteForm.reportValidity === "function" && !quoteForm.reportValidity()) {
        return;
      }
      submitQuote();
    });

    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        hideStatus();
      });
    }
  }

  /* Мобильное меню (.site-header__drawer + .is-open в components.css) */
  var toggle = document.getElementById("nav-toggle");
  var drawer = document.getElementById("nav-drawer");
  if (toggle && drawer) {
    toggle.addEventListener("click", function () {
      var open = drawer.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    drawer.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        drawer.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }
})();

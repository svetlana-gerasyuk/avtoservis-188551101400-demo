/* ГудАвто: запись (часовой пояс Ижевска, контакты, проверка полей, честная передача в Telegram),
   переходы к форме, просмотрщик фото. Без библиотек. Подключается патчем _dev/patch-site.mjs вместо записи из style.js. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TZ = "Europe/Samara"; // Ижевск, UTC+4
  // часы с карточки на Яндекс Картах: пн-пт 08-19, сб 10-16, вс выходной; последний слот – за час до закрытия
  const HOURS = { 1: [8, 18], 2: [8, 18], 3: [8, 18], 4: [8, 18], 5: [8, 18], 6: [10, 15] };
  const DAYS_AHEAD = 7;
  const wd = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const wdFull = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const mon = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const monShort = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const rub = (n) => Math.round(n).toLocaleString("ru-RU").replace(/[   ]/g, " ") + " ₽";

  // «сейчас» в Ижевске, независимо от часового пояса посетителя
  const izhNow = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour, min: +p.minute };
  };

  // ---- переход к форме: шапка, нижняя панель, цены, контакты
  const goToForm = (e) => {
    const a = e.target.closest("[data-ga-goto]"); if (!a) return;
    e.preventDefault();
    const target = document.getElementById("widget");
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const title = document.getElementById("booking-title");
    if (title) setTimeout(() => title.focus({ preventScroll: true }), reduce ? 0 : 450);
    if (history.replaceState) history.replaceState(null, "", "#widget");
  };
  document.addEventListener("click", goToForm);

  // ---- запись
  const form = document.querySelector("[data-ga-booking]");
  if (form) {
    const tg = (form.dataset.tg || "").replace(/^@|https?:\/\/t\.me\//g, "").trim();
    const daysBox = form.querySelector("[data-s-days]"), timesBox = form.querySelector("[data-s-times]");
    const bubble = form.querySelector("[data-s-bubble]");
    const fieldsBox = form.querySelector("[data-ga-fields]");
    const nextBtn = form.querySelector("[data-ga-next]"), sendBtn = form.querySelector("[data-ga-send]");
    const status = form.querySelector("[data-ga-status]");
    const f = { name: form.querySelector("#ga-name"), phone: form.querySelector("#ga-phone"), car: form.querySelector("#ga-car"), issue: form.querySelector("#ga-issue") };
    let message = "";

    // дни: рабочие дни Ижевска, сегодня – только если ещё остались часы
    const now = izhNow();
    const days = [];
    for (let i = 0; days.length < DAYS_AHEAD && i < 21; i++) {
      const dt = new Date(Date.UTC(now.y, now.m, now.d + i));
      const dow = dt.getUTCDay(), hrs = HOURS[dow];
      if (!hrs) continue;
      const slots = [];
      for (let h = hrs[0]; h <= hrs[1]; h++) {
        const past = i === 0 && h * 60 <= now.h * 60 + now.min + 30; // на сегодня – не раньше чем через полчаса
        slots.push({ t: String(h).padStart(2, "0") + ":00", past });
      }
      if (i === 0 && slots.every((s) => s.past)) continue;
      const short = i === 0 ? "Сегодня" : i === 1 ? "Завтра" : wd[dow] + ", " + dt.getUTCDate() + " " + monShort[dt.getUTCMonth()];
      const full = (i === 0 ? "сегодня, " : i === 1 ? "завтра, " : "") + wdFull[dow] + " " + dt.getUTCDate() + " " + mon[dt.getUTCMonth()];
      days.push({ short, full, slots });
    }
    daysBox.innerHTML = days.map((d, i) => `<label class="s-chip"><input type="radio" name="day" value="${i}"${i === 0 ? " checked" : ""}><span>${d.short}</span></label>`).join("");

    const drawTimes = () => {
      const d = days[+(daysBox.querySelector("input:checked") || {}).value || 0];
      const prev = (timesBox.querySelector("input:checked") || {}).value;
      const firstFree = d.slots.find((s) => !s.past);
      const keep = d.slots.some((s) => s.t === prev && !s.past) ? prev : firstFree && firstFree.t;
      timesBox.innerHTML = d.slots.map((s) => `<label class="s-chip"${s.past ? ' aria-disabled="true" title="Это время уже прошло"' : ""}><input type="radio" name="time" value="${s.t}"${s.past ? " disabled" : s.t === keep ? " checked" : ""}><span>${s.t}</span></label>`).join("");
    };

    const val = (el) => (el ? el.value.trim().replace(/\s+/g, " ") : "");
    const phoneDigits = (s) => {
      let d = String(s).replace(/\D/g, "");
      if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
      if (d.length === 10 && d[0] === "9") d = "7" + d;
      return d;
    };
    const phoneFmt = (d) => d.length === 11 ? `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}` : d;

    // услуги: можно несколько; сумма – только по известным ценам, «от», если хоть одна цена «от»
    const countEl = form.querySelector("[data-ga-count]"), totalEl = form.querySelector("[data-ga-total]");
    const repairEl = form.querySelector("[data-ga-repair]"), svcErr = form.querySelector("[data-ga-svc-err]");
    const picked = () => [...form.querySelectorAll("input[name=svc]:checked")];
    const estimate = () => {
      const list = picked(), priced = list.filter((s) => s.dataset.price);
      const sum = priced.reduce((a, s) => a + +s.dataset.price, 0);
      const from = priced.some((s) => s.dataset.from);
      return { list, sum, from, priced: priced.length > 0, repair: list.some((s) => !s.dataset.price) };
    };
    const svcLine = (s) => s.dataset.name + " – " + (s.dataset.price ? (s.dataset.from ? "от " : "") + rub(+s.dataset.price) : "после осмотра");
    const updateSum = () => {
      const e = estimate();
      countEl.textContent = "Выбрано услуг: " + e.list.length;
      totalEl.textContent = e.priced ? "Предварительно: " + (e.from ? "от " : "") + rub(e.sum) : "";
      repairEl.hidden = !e.repair;
      if (e.list.length) svcErr.textContent = "";
      nextBtn.setAttribute("aria-disabled", e.list.length ? "false" : "true");
      sendBtn.setAttribute("aria-disabled", e.list.length && tg ? "false" : "true");
      return e;
    };
    const needService = () => {
      if (picked().length) return true;
      svcErr.textContent = "Выберите хотя бы одну услугу.";
      const first = form.querySelector("input[name=svc]"); first.focus({ preventScroll: true });
      first.closest("fieldset").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return false;
    };

    const compose = () => {
      const e = updateSum();
      const d = days[+(daysBox.querySelector("input:checked") || {}).value || 0];
      const t = timesBox.querySelector("input:checked");
      const lines = [
        "Здравствуйте! Заявка на запись в ГудАвто с сайта.",
        "Услуги:",
        ...(e.list.length ? e.list.map((s) => "• " + svcLine(s)) : ["• не выбраны"]),
        "Предварительная стоимость: " + (e.priced ? (e.from ? "от " : "") + rub(e.sum) : "после осмотра") + (e.priced && e.repair ? " + ремонт – после осмотра" : ""),
        "Желаемое время: " + (d ? d.full : "") + (t ? ", " + t.value : ", время уточню"),
        "Имя: " + (val(f.name) || "…"),
        "Телефон: " + (phoneDigits(val(f.phone)).length === 11 ? phoneFmt(phoneDigits(val(f.phone))) : val(f.phone) || "…"),
        "Автомобиль: " + (val(f.car) || "…"),
      ];
      if (val(f.issue)) lines.push("Что беспокоит: " + val(f.issue));
      lines.push("Подтвердите, пожалуйста, время.");
      message = lines.join("\n");
      bubble.textContent = message;
    };

    // проверка обязательных полей
    const rules = {
      name: (v) => v.length < 2 ? "Напишите, как к вам обращаться." : "",
      phone: (v) => !v ? "Укажите телефон – по нему администратор подтвердит запись." : phoneDigits(v).length !== 11 || phoneDigits(v)[0] !== "7" ? "Проверьте номер: нужен российский номер из 11 цифр, например +7 912 345-67-89." : "",
      car: (v) => v.length < 2 ? "Укажите марку и модель, например Kia Rio." : "",
    };
    const showErr = (k) => {
      const el = f[k], msg = rules[k](val(el)), box = form.querySelector(`#ga-${k}-err`);
      el.setAttribute("aria-invalid", msg ? "true" : "false");
      box.textContent = msg;
      return !msg;
    };
    Object.keys(rules).forEach((k) => {
      f[k].addEventListener("blur", () => { if (val(f[k]) || f[k].getAttribute("aria-invalid") === "true") showErr(k); });
      f[k].addEventListener("input", () => { if (f[k].getAttribute("aria-invalid") === "true") showErr(k); });
    });
    f.phone.addEventListener("blur", () => { const d = phoneDigits(f.phone.value); if (d.length === 11 && d[0] === "7") { f.phone.value = phoneFmt(d); compose(); } });

    const openFields = (focus) => {
      fieldsBox.hidden = false; nextBtn.hidden = true; sendBtn.hidden = false;
      if (focus) f.name.focus();
    };
    nextBtn.addEventListener("click", () => { if (needService()) openFields(true); });

    // копирование: сначала синхронно (работает в любом браузере в момент нажатия), потом через Clipboard API
    const copy = (text) => {
      let ok = false;
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
      ta.remove();
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).catch(() => {});
      return ok || !!(navigator.clipboard && window.isSecureContext);
    };

    const showStatus = (copied) => {
      status.hidden = false;
      status.classList.toggle("is-warn", !copied);
      status.querySelector("[data-ga-status-title]").textContent = copied ? "Заявка подготовлена и скопирована" : "Заявка подготовлена";
      status.querySelector("[data-ga-status-text]").textContent = copied
        ? "В открывшемся чате Telegram вставьте текст в поле сообщения и отправьте. Время станет записью, когда администратор его подтвердит."
        : "Скопировать автоматически не получилось: выделите текст заявки выше и скопируйте вручную, затем отправьте его в чат Telegram. Время подтвердит администратор.";
    };

    if (!tg) {
      // деморежим: контакт не настроен – ничего не отправляем и не придумываем
      sendBtn.removeAttribute("href"); sendBtn.setAttribute("aria-disabled", "true");
      sendBtn.textContent = "Деморежим: Telegram не настроен";
      form.querySelector("[data-ga-send-note]").textContent = "Чтобы включить отправку, укажите ник Telegram в атрибуте data-tg формы записи.";
    } else {
      sendBtn.href = "https://t.me/" + tg;
    }

    sendBtn.addEventListener("click", (e) => {
      if (!tg) { e.preventDefault(); return; }
      if (!needService()) { e.preventDefault(); status.hidden = true; return; }
      openFields(false);
      const okAll = ["name", "phone", "car"].map(showErr).every(Boolean);
      compose();
      if (!okAll) {
        e.preventDefault();
        status.hidden = true;
        const bad = ["name", "phone", "car"].find((k) => f[k].getAttribute("aria-invalid") === "true");
        f[bad].focus();
        return;
      }
      // ссылка на чат откроется сама (обычный переход по ссылке – браузер не заблокирует)
      showStatus(copy(message));
    });
    status.querySelector("[data-ga-copy]").addEventListener("click", () => showStatus(copy(message)));
    const again = status.querySelector("[data-ga-open]"); if (tg) again.href = "https://t.me/" + tg; else again.hidden = true;

    daysBox.addEventListener("change", () => { drawTimes(); compose(); status.hidden = true; });
    form.addEventListener("change", () => { compose(); status.hidden = true; });
    form.addEventListener("input", compose);
    form.addEventListener("submit", (e) => e.preventDefault());
    drawTimes(); compose();
  }

  // ---- просмотрщик фото
  const lb = document.querySelector("[data-ga-lb]");
  const items = [...document.querySelectorAll("[data-ga-photo]")];
  if (lb && items.length && typeof lb.showModal === "function") {
    const img = lb.querySelector("img"), cap = lb.querySelector("p");
    let i = 0, opener = null;
    const show = (k) => { i = (k + items.length) % items.length; const b = items[i]; img.src = b.dataset.gaPhoto; img.alt = b.querySelector("img").alt; cap.textContent = b.dataset.caption || b.querySelector("img").alt; };
    items.forEach((b, k) => b.addEventListener("click", () => { opener = b; show(k); lb.showModal(); }));
    lb.querySelector("[data-ga-lb-close]").addEventListener("click", () => lb.close());
    lb.querySelector("[data-ga-lb-prev]").addEventListener("click", () => show(i - 1));
    lb.querySelector("[data-ga-lb-next]").addEventListener("click", () => show(i + 1));
    lb.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") show(i - 1); if (e.key === "ArrowRight") show(i + 1); });
    lb.addEventListener("click", (e) => { if (e.target === lb || e.target.classList.contains("ga-lb__in")) lb.close(); });
    lb.addEventListener("close", () => opener && opener.focus());
  } else items.forEach((b) => b.addEventListener("click", () => window.open(b.dataset.gaPhoto, "_blank", "noopener")));
})();

// Функция для динамической принудительной загрузки библиотеки, если HTML её проигнорировал
const ensureQRiousLoaded = () => {
  return new Promise((resolve, reject) => {
    if (typeof QRious !== 'undefined') {
      resolve(); // Если библиотека уже загружена, сразу продолжаем
      return;
    }

    console.warn("Библиотека QRious не найдена в HTML. Загружаем принудительно через JS...");
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js";
    script.onload = () => {
      console.log("Библиотека QRious успешно импортирована!");
      resolve();
    };
    script.onerror = () => reject(new Error("Не удалось загрузить библиотеку QRious с сервера CDN. Проверьте интернет."));
    document.head.appendChild(script);
  });
};

const generateBtn = document.getElementById('generate');

const generateQRCode = async () => {
  // Проверяем/подгружаем библиотеку перед выполнением кода
  try {
    await ensureQRiousLoaded();
  } catch (error) {
    alert(error.message);
    return;
  }

  // Извлекаем ID сотрудника из поля ввода
  const text = document.getElementById('text-url').value.trim();

  if (!text) {
    alert('Будь ласка, введіть ID працівника!');
    return;
  }

  const size = 300;
  const canvas = document.getElementById('qrcode');
  
  if (!canvas) {
    console.error("Елемент canvas з id='qrcode' не знайдено на сторінці!");
    return;
  }

  // Отрисовка кода (теперь QRious гарантированно определен)
   new QRious({
    element: canvas,
    value: text,
    size: size,
    level: 'H', // Добавьте эту строку (H = High коррекция ошибок)
    background: 'white',
    foreground: 'black'
  });

  console.log(`QR-код для ID "${text}" успішно згенеровано!`);
};

// Привязываем событие клика
if (generateBtn) {
  generateBtn.addEventListener('click', generateQRCode);
} else {
  console.error("Кнопка з id='generate' не знайдена на сторінці!");
}

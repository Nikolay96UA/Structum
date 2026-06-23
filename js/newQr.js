const generateBtn = document.getElementById('generate');
const downloadBtn = document.getElementById('download');
let namePng = ``;

const generateQRCode = () => {
  const text = document.getElementById('text-url').value.trim();
  const encodedText = unescape(encodeURIComponent(text));

  if (!text) {
    alert('Введите URL или текст, пожалуйста');
    return;
  }

  const size = 300;
  const canvas = document.getElementById('qrcode');
  const ctx = canvas.getContext('2d');
  
  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const qr = new QRious({
    level: 'H',
    size: size,
    value: encodedText
  });

  const img = new Image();
  img.src = qr.toDataURL();
  
  // Ждём, пока картинка загрузится в память
  img.onload = () => {
    ctx.drawImage(img, 0, 0, size, size);
    
    // Переносим вызов скачивания СЮДА
    namePng = text;
    downloadQRCode(); 
  };
};

const downloadQRCode = () => {
  const canvas = document.getElementById('qrcode');
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${namePng}.png`;
  link.click();
};

generateBtn.addEventListener('click', generateQRCode);

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer'; // Добавили импорт для работы с файлами
import * as XLSX from 'xlsx'; // Добавили импорт для чтения Excel
import ExcelJS from 'exceljs'; // ✅ Теперь всё в едином ES-стиле
import nodemailer from 'nodemailer';


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Настройка multer для чтения файлов прямо из памяти (без сохранения на жесткий диск)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- ПОДКЛЮЧЕНИЕ К MONGODB ---
const MONGO_URI = 'mongodb+srv://themaxplayn_db_user:6Qe2X8KRlCOISdcv@cluster0.xf3circ.mongodb.net/myDatabase?appName=Cluster0';

// --- НАСТРОЙКА ОТПРАВКИ EMAIL (NODEMAILER) ---

app.post('/api/users/send-qr-email', async (req, res) => {
    try {
        const { email, userName, qrImageDataUrl } = req.body;

        if (!email || !userName || !qrImageDataUrl) {
            return res.status(400).json({ success: false, message: 'Відсутні обов\'язкові дані для відправки!' });
        }

        const RESEND_API_KEY = "re_9ks7THyM_C7hnQ78hwTGSvi19spksc3o4"; 

        console.log(`Запуск отправки письма через HTTP API на адрес ${email}...`);

        const response = await fetch('https://resend.com', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            body: JSON.stringify({
                from: 'onboarding@resend.dev', 
                to: [email], 
                subject: '🏗️ Ваша електронна перепустка — STRUCTUM',
                // 🌟 ВСТРОИЛИ QR-КОД ПРЯМО В HTML ЧЕРЕЗ ТЕГ <img> (Картинка отобразится прямо внутри письма!)
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 500px; margin: 0 auto; border: 1px solid #e1e4e8; border-radius: 8px; text-align: center;">
                        <h2 style="color: #28a745; border-bottom: 2px solid #28a745; padding-bottom: 10px; text-align: left;">Вітаємо, ${userName}!</h2>
                        <p style="text-align: left;">Адміністрація компанії <strong>STRUCTUM</strong> сформувала для вас персональну електронну перепустку.</p>
                        
                        <div style="margin: 25px 0; background: #ffffff; padding: 10px; display: inline-block; border: 2px solid #28a745; border-radius: 4px;">
                            <img src="${qrImageDataUrl}" alt="QR Перепустка" style="width: 250px; height: 250px; display: block;" />
                        </div>

                        <p style="background: #f4f6f9; padding: 12px; border-left: 4px solid #007bff; text-align: left; margin: 20px 0;">
                            <strong>Важливо:</strong> Збережіть цей QR-код на телефон (зробіть скріншот листа) та пред'являйте його бригадиру при вході на об'єкт для фіксації робочого часу.
                        </p>
                        <br>
                        <small style="color: #888; display: block; border-top: 1px solid #e1e4e8; padding-top: 10px; text-align: left;">Цей лист згенеровано автоматично системою STRUCTUM.</small>
                    </div>
                `
            })
        });

        const responseText = await response.text(); 
        let data = {};
        
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error("Vercel/Resend все еще вернул HTML:", responseText.substring(0, 250));
            return res.status(500).json({ success: false, message: 'Поштовий сервіс повернув некоректну відповідь' });
        }

        if (response.ok) {
            console.log(`✅ Лист успішно відправлено через HTTP API! ID: ${data.id || 'OK'}`);
            return res.json({ success: true, message: `Перепустку успішно відправлено на пошту!` });
        } else {
            console.error('Помилка відповіді API Resend:', data);
            return res.status(500).json({ success: false, message: 'Поштовий сервіс відхилив запит' });
        }

    } catch (error) {
        console.error('Помилка відправки Email через HTTP API:', error);
        res.status(500).json({ success: false, message: 'Помилка сервера при відправці листа' });
    }
});





mongoose.connect(MONGO_URI)
  .then(() => console.log('🍃 Успешно подключено к MongoDB Atlas!'))
  .catch(err => console.error('❌ Ошибка подключения к базе:', err));

// --- СХЕМА ПОЛЬЗОВАТЕЛЯ ---
const userSchema = new mongoose.Schema({
    name: String,
    job: String,
    tariff: { type: Number, default: 2000 }, 
    debt: { type: Number, default: 0 },       // Долг работников (Борг)
    bonuses: { type: Number, default: 0 },    // Премии (Додано)
    penalties: { type: Number, default: 0 },  // Штрафы (Утримано)
    notes: { type: String, default: '' },     // Примечания (Примітки)
      phone: { type: String, default: '' },   // 🌟 Новое поле: Телефон
    email: { type: String, default: '' },   // 🌟 Новое поле: Email
    createdAt: { type: Date, default: Date.now }
});


const User = mongoose.model('User', userSchema);

// --- МАРШРУТЫ API ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ ---

// 1. Получить всех пользователей из базы
// 1. Получить всех пользователей из базы с актуальной локацией за сегодня
// 1. Получить всех пользователей с последней исторической локацией и статусом на сегодня
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().lean();
        
        // 1. Получаем строковую дату СЕГОДНЯШНЕГО дня (ГГГГ-ММ-ДД)
        const todayStr = new Date().toISOString().split('T')[0];

        // 2. Загружаем абсолютно ВСЕ посещения из базы для анализа истории
        const allVisits = await Visit.find().sort({ scannedAt: -1 }).lean();

        const usersWithLocation = users.map(user => {
            // Ищем все визиты конкретно этого человека за всё время
            const userVisits = allVisits.filter(v => v.userId && v.userId.toString() === user._id.toString());
            
            let lastLocation = 'Немає відміток';
            let isScannedToday = false;

            if (userVisits.length > 0) {
                // Так как мы отсортировали allVisits по убыванию времени, первый элемент — самый свежий в истории
                lastLocation = userVisits[0].objectName;

                // Проверяем, был ли этот самый свежий визит (или любой другой) сделан именно СЕГОДНЯ
                isScannedToday = userVisits.some(v => v.dateString === todayStr);
            }

            return {
                ...user,
                lastLocation,     // Имя объекта за всё время (или сегодня, если он там)
                isScannedToday    // Булево поле (true/false) — был ли скан СЕГОДНЯ
            };
        });

        res.json(usersWithLocation);
    } catch (error) {
        console.error('Ошибка при получении пользователей:', error);
        res.status(500).json({ message: 'Ошибка при получении данных' });
    }
});


// --- СХЕМА ДЛЯ АККАУНТОВ ПОЛЬЗОВАТЕЛЕЙ СИСТЕМЫ ---
const accountSchema = new mongoose.Schema({
    login: { type: String, required: true, unique: true },
    password: { type: String, required: true }, 
    role: { type: String, default: 'brigadier' }, 
    objectName: { type: String, default: '' }, 
    createdAt: { type: Date, default: Date.now }
});

// --- СХЕМА СТРОИТЕЛЬНЫХ ОБЪЕКТОВ ---
const objectSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

const ConstructionObject = mongoose.model('ConstructionObject', objectSchema);


const Account = mongoose.model('Account', accountSchema);

// --- РОУТ РЕГИСТРАЦИИ НОВОГО БРИГАДИРА ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { login, password, objectName } = req.body;

        if (!login || !password || !objectName) {
            return res.status(400).json({ success: false, message: 'Заповніть всі поля!' });
        }

        const existingAccount = await Account.findOne({ login });
        if (existingAccount) {
            return res.status(400).json({ success: false, message: 'Такий логін вже зайнятий!' });
        }

        // 🌟 СИНХРОНИЗАЦИЯ: Проверяем, есть ли такой объект в нашей общей базе объектов
        let obj = await ConstructionObject.findOne({ name: objectName });
        if (!obj) {
            // Если объекта нет — создаем его в базе данных
            obj = new ConstructionObject({ name: objectName });
            await obj.save();
        }

        const newAccount = new Account({
            login,
            password, 
            role: 'brigadier',
            objectName: obj.name // Привязываем к проверенному имени
        });

        await newAccount.save();
        res.status(201).json({ success: true, message: 'Акаунт успішно створено!' });
    } catch (error) {
        console.error('Помилка при реєстрації:', error);
        res.status(500).json({ message: 'Помилка сервера при реєстрації' });
    }
});


// 5. Авторизация бригадира и получение привязанного объекта
app.post('/api/auth/login', async (req, res) => {
    try {
        const { login, password } = req.body;

        const account = await Account.findOne({ login, password });

        if (!account) {
            return res.status(401).json({ success: false, message: 'Неверный логин или пароль!' });
        }

        res.json({
            success: true,
            login: account.login,
            role: account.role,
            objectName: account.objectName 
        });
    } catch (error) {
        console.error('Ошибка при авторизации:', error);
        res.status(500).json({ message: 'Ошибка сервера при проверке аккаунта' });
    }
});

// 2. Добавить нового пользователя в базу
app.post('/api/users', async (req, res) => {
    try {
        const newUser = new User({ 
            name: req.body.name, 
            job: req.body.job,
            tariff: req.body.tariff, 
            debt: req.body.debt || 0,
            bonuses: req.body.bonuses || 0,
            penalties: req.body.penalties || 0,
            notes: req.body.notes || '',
            phone: req.body.phone || '',
            email: req.body.email || ''
        });
        await newUser.save(); 
        res.status(201).json({ success: true, user: newUser });
    } catch (error) {
        res.status(400).json({ message: 'Ошибка при сохранении' }); 
    }
});

// 3. Удалить пользователя по его ID из MongoDB
app.delete('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const deletedUser = await User.findByIdAndDelete(userId);
        
        if (!deletedUser) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        res.json({ success: true, message: 'Пользователь успешно удален' });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка при удалении' });
    }
});

// --- МАРШРУТ API ДЛЯ ТАБЕЛЯ EXCEL ---

// 4. Загрузка файла Excel, парсинг и отправка JSON обратно
app.post('/api/tabel/upload', upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Файл не загружен' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0]; // Извлекаем имя первого листа
        const worksheet = workbook.Sheets[firstSheetName]; // Подставляем точное имя листа
        
        // Читаем со строки №3 (индекс 2), пропуская объединенную шапку
        const rawData = XLSX.utils.sheet_to_json(worksheet, { range: 2 });

        res.json({ success: true, data: rawData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка при обработке Excel' });
    }
});

// --- СХЕМА И МОДЕЛЬ ДЛЯ ПОСЕЩЕНИЙ С УЧЕТОМ ОБЪЕКТОВ ---
const visitSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    dateString: String, 
    objectName: String, // Название строительного объекта
    scannedAt: { type: Date, default: Date.now }
});

const Visit = mongoose.model('Visit', visitSchema); // ✅ Зарегистрировали модель посещений

// --- МАРШРУТ ДЛЯ СКАНИРОВАНИЯ QR-КОДА С БЛОКИРОВКОЙ ДРУГИХ ОБЪЕКТОВ ---
app.post('/api/attendance/scan', async (req, res) => {
    try {
        const { userId, objectName } = req.body; 

        if (!objectName) {
            return res.status(400).json({ message: 'Не указан строительный объект' });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Некорректный формат QR-кода' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Сотрудник не найден в системе' });
        }

        // Чистая дата в формате YYYY-MM-DD
        const todayStr = new Date().toISOString().split('T')[0];

        // 🌟 ИСПРАВЛЕННАЯ ПРОВЕРКА: Ищем ЛЮБУЮ отметку сотрудника за сегодня на ЛЮБОМ объекте
        const existingVisit = await Visit.findOne({ userId, dateString: todayStr });
        
        if (existingVisit) {
            // Если он уже отметился именно на ЭТОМ объекте
            if (existingVisit.objectName === objectName) {
                return res.status(400).json({ 
                    message: `⚠ ${user.name} уже отмечен на вашем объекте сегодня!` 
                });
            } else {
                // 🌟 БЛОКИРОВКА: Если он отметился на ДРУГОМ объекте
                return res.status(400).json({ 
                    message: `❌ Ошибка! ${user.name} сегодня уже был отмечен на объекте: "${existingVisit.objectName}"` 
                });
            }
        }

        // Если за сегодня отметок нет вообще — создаем новую запись с привязкой к текущему объекту
        const newVisit = new Visit({ userId, dateString: todayStr, objectName });
        await newVisit.save();

        res.json({ 
            success: true, 
            message: `✅ Отмечено на ${objectName}: ${user.name} (${user.job})`, 
            userName: user.name 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при фиксации времени' });
    }
});

// --- РОУТ ДЛЯ СКАЧИВАНИЯ ТАБЕЛЯ ОБЪЕКТА (СТРОГО ДЛЯ ТЕХ КТО ПОСЕЩАЛ) ---
app.get('/api/attendance/download-excel', async (req, res) => {
    try {
        // 🌟 ОБЪЯВЛЯЕМ ПЕРЕМЕННЫЕ В САМОМ ВЕРХУ (Это устраняет ошибку year is not defined!)
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1); 
        const objectName = req.query.objectName; 

        if (!objectName) {
            return res.status(400).send('Помилка: Не вказано назву об\'єкта (?objectName=...)');
        }

        const daysInMonth = new Date(year, month, 0).getDate(); 
        const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const endDateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`AT-${month}`);
        sheet.views = [{ showGridLines: true }];

        // Настройка ширины колонок
        sheet.getColumn(1).width = 4;   
        sheet.getColumn(2).width = 32;  
        sheet.getColumn(3).width = 14;  
        for (let d = 1; d <= daysInMonth; d++) {
            sheet.getColumn(3 + d).width = 3.2; 
        }
        const startFinanceCol = 4 + daysInMonth;
        sheet.getColumn(startFinanceCol).width = 7;     
        sheet.getColumn(startFinanceCol + 1).width = 6; 
        sheet.getColumn(startFinanceCol + 2).width = 6; 
        sheet.getColumn(startFinanceCol + 3).width = 8; 
        sheet.getColumn(startFinanceCol + 4).width = 8; 
        sheet.getColumn(startFinanceCol + 5).width = 8; 
        sheet.getColumn(startFinanceCol + 6).width = 8; 
        sheet.getColumn(startFinanceCol + 7).width = 9; 
        sheet.getColumn(startFinanceCol + 8).width = 15;

        const thinBorder = {
            top: { style: 'thin', color: { argb: 'BFBFBF' } },
            left: { style: 'thin', color: { argb: 'BFBFBF' } },
            bottom: { style: 'thin', color: { argb: 'BFBFBF' } },
            right: { style: 'thin', color: { argb: 'BFBFBF' } }
        };

        // Шапка таблицы
        sheet.mergeCells(`D1:${sheet.getCell(1, 3 + daysInMonth).address}`);
        const monthCell = sheet.getCell('D1');
        monthCell.value = `Табель: ${objectName} — Місяць ${month}.${year}`;
        monthCell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF0000' } }; 
        monthCell.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.mergeCells(`A2:${sheet.getCell(2, 3 + daysInMonth).address}`);
        sheet.getCell('A2').value = "Загальнобудівельні роботи";
        sheet.getCell('A2').font = { name: 'Times New Roman', size: 10, bold: true };
        sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
        for (let col = 1; col <= startFinanceCol + 8; col++) {
            sheet.getCell(2, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } }; 
            sheet.getCell(2, col).border = thinBorder;
        }

        const row3 = sheet.getRow(3);
        row3.height = 20;
        row3.values = [
            '№', 'ПІБ', 'Посада', 
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1), 'Днів', 'Днів 2', 'Тариф1', 'Тариф 2', 'Додано', 'Утримано', 'Сума', 'Примітки'
        ];

        for (let col = 1; col <= startFinanceCol + 8; col++) {
            const cell = sheet.getCell(3, col);
            cell.font = { name: 'Times New Roman', size: 9, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = thinBorder;

            if (col >= 4 && col <= 3 + daysInMonth) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC000' } }; 
            } else if (col === startFinanceCol) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } }; 
            } else if (col === startFinanceCol + 1 || col === startFinanceCol + 2) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DDEBF7' } }; 
            } else if (col === startFinanceCol + 5) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } }; 
            } else if (col === startFinanceCol + 6) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FCE4D6' } }; 
            } else {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F2F2F2' } }; 
            }
        }

        // Загружаем только те визиты, которые относятся к этому объекту в отчетном месяце
        const objectVisits = await Visit.find({
            objectName: objectName,
            dateString: { $gte: startDateStr, $lt: endDateStr }
        });

        // Вытаскиваем уникальные ID сотрудников, которые отметились на этом объекте хоть раз
        const uniqueUserIds = [...new Set(objectVisits.map(v => v.userId ? v.userId.toString() : null))].filter(Boolean);

        // Загружаем из базы карточки ТОЛЬКО этих сотрудников (и сортируем по имени)
        const users = await User.find({ _id: { $in: uniqueUserIds } }).sort({ name: 1 });

        // Заполняем строки данными сотрудников
        users.forEach((user, index) => {
            const rowIndex = 4 + index; 
            const row = sheet.getRow(rowIndex);
            row.height = 18; 

            row.getCell(1).value = index + 1;
            row.getCell(2).value = user.name || 'Без імені';
            row.getCell(3).value = user.job || 'Робітник';

            let workedDaysCount = 0;
            
            for (let day = 1; day <= daysInMonth; day++) {
                const colIndex = 3 + day;
                const currentDayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                const hasScan = objectVisits.some(visit => 
                    visit.userId && visit.userId.toString() === user._id.toString() && 
                    visit.dateString === currentDayStr
                );

                const dayCell = row.getCell(colIndex);
                if (hasScan) {
                    dayCell.value = 8; 
                    workedDaysCount++;
                } else {
                    dayCell.value = ''; 
                }
                
                dayCell.alignment = { horizontal: 'center', vertical: 'middle' };
                dayCell.font = { name: 'Times New Roman', size: 9 };
                dayCell.border = thinBorder;
            }

            const colBorg = 4 + daysInMonth;
            const colDniv = colBorg + 1;
            const colDniv2 = colBorg + 2;
            const colTarif1 = colBorg + 3;
            const colTarif2 = colBorg + 4;
            const colDodano = colBorg + 5;
            const colUtrimano = colBorg + 6;
            const colSuma = colBorg + 7;
            const colPrim = colBorg + 8;

            row.getCell(colBorg).value = user.debt || null;
            row.getCell(colDniv).value = workedDaysCount; 
            row.getCell(colDniv2).value = null; 
            row.getCell(colTarif1).value = user.tariff || 0;
            row.getCell(colTarif2).value = null; 
            row.getCell(colDodano).value = user.bonuses || null;
            row.getCell(colUtrimano).value = user.penalties || null; 

            const dnivLetter = sheet.getCell(rowIndex, colDniv).address.replace(/[0-9]/g, '');     
            const tarifLetter = sheet.getCell(rowIndex, colTarif1).address.replace(/[0-9]/g, '');   
            const dodanoLetter = sheet.getCell(rowIndex, colDodano).address.replace(/[0-9]/g, '');   
            const utrimanoLetter = sheet.getCell(rowIndex, colUtrimano).address.replace(/[0-9]/g, ''); 

            row.getCell(colSuma).value = {
                formula: `=${dnivLetter}${rowIndex}*${tarifLetter}${rowIndex}+SUM(${dodanoLetter}${rowIndex})-SUM(${utrimanoLetter}${rowIndex})`
            };

            row.getCell(colPrim).value = user.notes || '';

            for (let c = 1; c <= startFinanceCol + 8; c++) {
                const cell = row.getCell(c);
                cell.border = thinBorder;
                cell.font = { name: 'Times New Roman', size: 9 };
                if (c !== 2 && c !== 3 && c !== colPrim) { 
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                } else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                }
            }
        });
        // --- ОТПРАВКА ГОТОВОГО ФАЙЛА В БРАУЗЕР ---
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Tabel_${month}_${year}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Помилка генерації чистого Excel:', error);
        res.status(500).send('Помилка сервера при створенні Excel');
    }
});



// ______________________

// --- РОУТ ДЛЯ ПОЛУЧЕНИЯ ВСЕХ УНИКАЛЬНЫХ ОБЪЕКТОВ ---
app.get('/api/objects', async (req, res) => {
    try {
        const objects = await ConstructionObject.find().sort({ name: 1 });
        res.json({ success: true, objects: objects.map(o => o.name) });
    } catch (error) {
        console.error('Помилка при отриманні об\'єктів:', error);
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// --- ЗАЩИЩЕННЫЙ РОУТ УДАЛЕНИЯ ОБЪЕКТА С ПАРОЛЕМ АДМИНИСТРАТОРА ---
// --- ЗАЩИЩЕННЫЙ РОУТ УДАЛЕНИЯ ОБЪЕКТА С ПРОВЕРКОЙ ПАРОЛЯ АККАУНТА ---
// --- ЗАЩИЩЕННЫЙ РОУТ УДАЛЕНИЯ ОБЪЕКТА (ПРОВЕРКА ТОЛЬКО ЛОГИНА И ПАРОЛЯ) ---
app.delete('/api/objects', async (req, res) => {
    try {
        const { objectName, login, password } = req.body;

        if (!objectName || !login || !password) {
            return res.status(400).json({ success: false, message: 'Заповніть всі поля запросу!' });
        }

        // 1. Находим аккаунт в базе данных по логину
        const currentAccount = await Account.findOne({ login });

        if (!currentAccount) {
            return res.status(404).json({ success: false, message: 'Користувача не знайдено в системі.' });
        }

        // 2. Проверяем, совпадает ли введённый пароль с паролем этого аккаунта
        if (currentAccount.password !== password) {
            return res.status(403).json({ success: false, message: 'Невірний пароль від вашого акаунту! Видалення заблоковано.' });
        }

        // 3. Удаляем объект из коллекции объектов
        const deletedObject = await ConstructionObject.findOneAndDelete({ name: objectName });

        if (!deletedObject) {
            return res.status(404).json({ success: false, message: 'Об\'єкт не знайдено в базі даних.' });
        }

        res.json({ success: true, message: `Об'єкт "${objectName}" та його табель успішно видалено зі списку!` });
    } catch (error) {
        console.error('Помилка при видаленні об\'єкта:', error);
        res.status(500).json({ message: 'Помилка сервера при видаленні' });
    }
});



// --- РОУТ ДЛЯ ОТПРАВКИ QR-КОДА НА EMAIL РАБОТНИКА ---
app.post('/api/users/send-qr-email', async (req, res) => {
    try {
        const { email, userName, qrImageDataUrl } = req.body;

        if (!email || !userName || !qrImageDataUrl) {
            return res.status(400).json({ success: false, message: 'Відсутні обов\'язкові дані для відправки!' });
        }

        // Отсекаем техническую шапку Base64, чтобы получить чистые бинарные данные картинки
        const base64Data = qrImageDataUrl.replace(/^data:image\/png;base64,/, "");

        const mailOptions = {
            from: '"STRUCTUM Облік Персоналу" <themaxplayn@gmail.com>', // Почта компании
            to: email, // Почта сотрудника из базы данных
            subject: `🏗️ Ваша електронна перепустка — STRUCTUM`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #28a745;">Вітаємо, ${userName}!</h2>
                    <p>Адміністрація компанії <strong>STRUCTUM</strong> сформувала для вас персональну електронну перепустку.</p>
                    <p>Ваш індивідуальний QR-код знаходиться у вкладенні до цього листа.</p>
                    <p style="background: #f4f6f9; padding: 10px; border-left: 4px solid #007bff;">
                        <strong>Важливо:</strong> Збережіть це зображення на телефон та пред'являйте його бригадиру при вході на будівельний об'єкт для фіксації робочого часу.
                    </p>
                    <br>
                    <small style="color: #888;">Цей лист згенеровано автоматично, відповідати на нього не потрібно.</small>
                </div>
            `,
            attachments: [
                {
                    filename: `Perepustka_${userName.replace(/\s+/g, '_')}.png`,
                    content: base64Data,
                    encoding: 'base64'
                }
            ]
        };

        // Отправляем письмо
        await transporter.sendMail(mailOptions);
        
        res.json({ success: true, message: `Перепустку успішно відправлено на пошту ${email}!` });
    } catch (error) {
        console.error('Помилка відправки Email:', error);
        res.status(500).json({ success: false, message: 'Помилка сервера при відправці листа' });
    }
});


// --- ЗАПУСК СЕРВЕРА (Всегда самый конец файла) ---
app.listen(PORT, () => {
    console.error(`📡 Бэкенд-сервер STRUCTUM успешно запущен на порту ${PORT}`);
});

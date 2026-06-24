import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer'; // Добавили импорт для работы с файлами
import * as XLSX from 'xlsx'; // Добавили импорт для чтения Excel
import ExcelJS from 'exceljs'; // ✅ Теперь всё в едином ES-стиле

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Настройка multer для чтения файлов прямо из памяти (без сохранения на жесткий диск)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- ПОДКЛЮЧЕНИЕ К MONGODB ---
const MONGO_URI = 'mongodb+srv://themaxplayn_db_user:6Qe2X8KRlCOISdcv@cluster0.xf3circ.mongodb.net/myDatabase?appName=Cluster0';

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
    createdAt: { type: Date, default: Date.now }
});
// ___________________________________________


const User = mongoose.model('User', userSchema);

// --- МАРШРУТЫ API ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ ---

// 1. Получить всех пользователей из базы
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Ошибка при получении данных' });
    }
});

// 2. Добавить нового пользователя в базу
app.post('/api/users', async (req, res) => {
    try {
        const newUser = new User({ 
            name: req.body.name, 
            job: req.body.job,
            tariff: req.body.tariff, // Теперь тариф будет сохраняться из формы!
            debt: req.body.debt || 0,
            bonuses: req.body.bonuses || 0,
            penalties: req.body.penalties || 0,
            notes: req.body.notes || ''
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
app.post('/api/tabel/upload', upload.single('excelFile'), async (req, res) => { // Исправили tavel на tabel
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Файл не загружен' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; 
        const worksheet = workbook.Sheets[sheetName]; 
        
        // Читаем со строки №3 (индекс 2), пропуская объединенную шапку
        const rawData = XLSX.utils.sheet_to_json(worksheet, { range: 2 });

        res.json({ success: true, data: rawData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка при обработке Excel' });
    }
});

// --- СХЕМА ДЛЯ ПОСЕЩЕНИЙ ---
const visitSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Ссылка на сотрудника
    dateString: String, // Дата в текстовом формате "2026-06-24" для легкого поиска
    scannedAt: { type: Date, default: Date.now }
});

const Visit = mongoose.model('Visit', visitSchema);
// --- МАРШРУТ ДЛЯ СКАНИРОВАНИЯ QR-КОДА ---
app.post('/api/attendance/scan', async (req, res) => {
    try {
        const { userId } = req.body;

        // 1. Проверяем валидность формата ID, чтобы сервер не падал от левых QR-кодов
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Некорректный формат QR-кода' });
        }

        // 2. Проверяем наличие пользователя в базе
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Сотрудник не найден в системе' });
        }

        // 3. Получаем сегодняшнюю дату (ГГГГ-ММ-ДД)
        const todayStr = new Date().toISOString().split('T')[0];

        // 4. Проверяем дубликаты сканирования за сегодня
        const alreadyScanned = await Visit.findOne({ userId, dateString: todayStr });
        if (alreadyScanned) {
            return res.status(400).json({ message: `${user.name} уже отмечен сегодня!` });
        }

        // 5. Записываем приход на работу
        const newVisit = new Visit({ userId, dateString: todayStr });
        await newVisit.save();

        res.json({ success: true, message: `Отмечено: ${user.name} (${user.job})`, userName: user.name });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при фиксации времени' });
    }
});

// --- МАРШРУТ ДЛЯ СКАЧИВАНИЯ ТАБЕЛЯ В EXCEL ---
// app.get('/api/attendance/download-excel', async (req, res) => {
//     try {
//         // Получаем месяц и год из строки запроса (например, ?year=2026&month=6) или берем текущие
//         const year = parseInt(req.query.year) || new Date().getFullYear();
//         const month = parseInt(req.query.month) || (new Date().getMonth() + 1); 
//         const daysInMonth = new Date(year, month, 0).getDate(); 

//         const workbook = new ExcelJS.Workbook();
//         const sheet = workbook.addWorksheet(`AT-${month}`);
//         sheet.views = [{ showGridLines: true }];

//         // 1. Создаем шапку таблицы
//         sheet.mergeCells('A1:C1');
//         sheet.getCell('A1').value = `Табель робочого часу - Місяць ${month}.${year}`;
//         sheet.getCell('A1').font = { name: 'Times New Roman', size: 12, bold: true };

//         sheet.getRow(3).values = [
//             '№', 'ПІБ', 'Посада', 
//             ...Array.from({ length: daysInMonth }, (_, i) => i + 1), 
//             'Борг', 'Днів', 'Днів 2', 'Тариф 1', 'Тариф 2', 'Додано', 'Утримано', 'Сума', 'Примітки'
//         ];

//         // 2. Стилизуем ячейки с датами (желтый цвет как на скриншоте)
//         for (let col = 4; col <= 3 + daysInMonth; col++) {
//             const cell = sheet.getCell(3, col);
//             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC000' } };
//             cell.font = { bold: true };
//             cell.alignment = { horizontal: 'center' };
//         }

//         // 3. Получаем всех пользователей и все посещения
//         const users = await User.find().sort({ name: 1 });
//         const visits = await Visit.find();

//               // 4. Заполняем строки данными сотрудников
//         users.forEach((user, index) => {
//             const rowIndex = 4 + index; 
//             const row = sheet.getRow(rowIndex);

//             row.getCell(1).value = index + 1;
//             row.getCell(2).value = user.name || 'Без имени';
//             row.getCell(3).value = user.job || 'Рабочий';

//             let workedDaysCount = 0;
            
//             // Проверяем явки на каждый день месяца
//             for (let day = 1; day <= daysInMonth; day++) {
//                 const colIndex = 3 + day;
//                 const currentDayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
//                 const hasScan = visits.some(visit => 
//                     visit.userId && visit.userId.toString() === user._id.toString() && 
//                     visit.dateString === currentDayStr
//                 );

//                 if (hasScan) {
//                     row.getCell(colIndex).value = 8; // Ставим 8, если был скан
//                     workedDaysCount++;
//                 } else {
//                     // 🌟 Теперь здесь может быть пусто '', или ты можешь руками вписать 'В' в скачанном файле
//                     row.getCell(colIndex).value = ''; 
//                 }
//             }
//             // Индексы финальных колонок после дат
//             const colBorg = 4 + daysInMonth;
//             const colDniv = colBorg + 1; // 🌟 Колонка "Днів", где число явок уже посчитано сервером
//             const colDniv2 = colBorg + 2;
//             const colTarif1 = colBorg + 3; // 🌟 Колонка "Тариф 1"
//             const colTarif2 = colBorg + 4;
//             const colDodano = colBorg + 5; // 🌟 Колонка "Додано"
//             const colUtrimano = colBorg + 6; // 🌟 Колонка "Утримано"
//             const colSuma = colBorg + 7;   // 🌟 Колонка "Сума"
//             const colPrim = colBorg + 8;

//             row.getCell(colBorg).value = user.debt || 0;
//             row.getCell(colDniv).value = workedDaysCount; // Сюда бэкенд записывает чистое число (например, 15)
//             row.getCell(colDniv2).value = 0; 
//             row.getCell(colTarif1).value = user.tariff || 0;
//             row.getCell(colTarif2).value = 0; 
//             row.getCell(colDodano).value = user.bonuses || 0;
//             row.getCell(colUtrimano).value = user.penalties || 0; 

//             // Получаем точные адреса ячеек для текущей строки (например, AJ4, AL4 и т.д.)
//             const dnivAddress = sheet.getCell(rowIndex, colDniv).address;
//             const tarifAddress = sheet.getCell(rowIndex, colTarif1).address;
//             const dodanoAddress = sheet.getCell(rowIndex, colDodano).address;
//             const utrimanoAddress = sheet.getCell(rowIndex, colUtrimano).address;

//             // 🌟 ЖЕЛЕЗНАЯ ФОРМУЛА: Число Дней * Тариф + Добавлено - Удержано
//             // Больше никакой зависимости от букв "В" в календаре!
//             row.getCell(colSuma).value = {
//                 formula: `=${dnivAddress}*${tarifAddress}+${dodanoAddress}-${utrimanoAddress}`
//             };

//             row.getCell(colPrim).value = user.notes || '';
//             row.font = { name: 'Times New Roman', size: 10 };
//         });


//         sheet.getColumn(2).width = 35; // Автоширина для ФИО
//         sheet.getColumn(3).width = 15; // Автоширина для должностей

//         // 5. Настройка заголовков для скачивания файла браузером
//         res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//         res.setHeader('Content-Disposition', `attachment; filename=Tabel_${month}_${year}.xlsx`);

//         await workbook.xlsx.write(res);
//         res.end();

//     } catch (error) {
//         console.error('Ошибка генерации Excel:', error);
//         res.status(500).send('Ошибка сервера при создании Excel');
//     }
// });
app.get('/api/attendance/download-excel', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1); 
        const daysInMonth = new Date(year, month, 0).getDate(); 

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`AT-${month}`);
        
        // Включаем отображение стандартной сетки Excel
        sheet.views = [{ showGridLines: true }];

        // --- НАСТРОЙКА ШИРИНЫ КОЛОНОК ---
        sheet.getColumn(1).width = 4;   // №
        sheet.getColumn(2).width = 32;  // ПІБ
        sheet.getColumn(3).width = 14;  // Посада
        for (let d = 1; d <= daysInMonth; d++) {
            sheet.getColumn(3 + d).width = 3.2; // Узкие колонки для дат (1-31)
        }
        const startFinanceCol = 4 + daysInMonth;
        sheet.getColumn(startFinanceCol).width = 7;     // Борг
        sheet.getColumn(startFinanceCol + 1).width = 6; // Днів
        sheet.getColumn(startFinanceCol + 2).width = 6; // Днів 2
        sheet.getColumn(startFinanceCol + 3).width = 8; // Тариф 1
        sheet.getColumn(startFinanceCol + 4).width = 8; // Тариф 2
        sheet.getColumn(startFinanceCol + 5).width = 8; // Додано
        sheet.getColumn(startFinanceCol + 6).width = 8; // Утримано
        sheet.getColumn(startFinanceCol + 7).width = 9; // Сума
        sheet.getColumn(startFinanceCol + 8).width = 15;// Примітки

        // --- СТИЛИ ДЛЯ ГРАНИЦ (Тонкие линии вокруг ячеек) ---
        const thinBorder = {
            top: { style: 'thin', color: { argb: 'BFBFBF' } },
            left: { style: 'thin', color: { argb: 'BFBFBF' } },
            bottom: { style: 'thin', color: { argb: 'BFBFBF' } },
            right: { style: 'thin', color: { argb: 'BFBFBF' } }
        };

        // --- СТРОКА 1: Название месяца ---
        sheet.mergeCells(`D1:${sheet.getCell(1, 3 + daysInMonth).address}`);
        const monthCell = sheet.getCell('D1');
        monthCell.value = `Червень ${year}   (AT-2)`;
        monthCell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF0000' } }; // Красный текст
        monthCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // --- СТРОКА 2: Верхняя зеленая полоса ---
        const row2 = sheet.getRow(2);
        row2.height = 14;
        sheet.mergeCells(`A2:${sheet.getCell(2, 3 + daysInMonth).address}`);
        sheet.getCell('A2').value = "Загальнобудівельні роботи";
        sheet.getCell('A2').font = { name: 'Times New Roman', size: 10, bold: true };
        sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
        for (let col = 1; col <= startFinanceCol + 8; col++) {
            sheet.getCell(2, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } }; // Светло-зеленый
            sheet.getCell(2, col).border = thinBorder;
        }

        // --- СТРОКА 3: Шапка колонок ---
        const row3 = sheet.getRow(3);
        row3.height = 20;
        row3.values = [
            '№', 'ПІБ', 'Посада', 
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1), 
            'Борг', 'Днів', 'Днів 2', 'Тариф1', 'Тариф 2', 'Додано', 'Утримано', 'Сума', 'Примітки'
        ];

        // Стилизация ячеек строки 3
        for (let col = 1; col <= startFinanceCol + 8; col++) {
            const cell = sheet.getCell(3, col);
            cell.font = { name: 'Times New Roman', size: 9, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = thinBorder;

            // Красим в зависимости от колонки как на фото
            if (col >= 4 && col <= 3 + daysInMonth) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC000' } }; // Ярко-желтый для дат
            } else if (col === startFinanceCol) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } }; // Светло-желтый Борг
            } else if (col === startFinanceCol + 1 || col === startFinanceCol + 2) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DDEBF7' } }; // Голубой Днів
            } else if (col === startFinanceCol + 5) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } }; // Зеленый Додано
            } else if (col === startFinanceCol + 6) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FCE4D6' } }; // Красный Утримано
            } else {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F2F2F2' } }; // Серый для остальных
            }
        }

        // --- НАПОЛНЕНИЕ ДАННЫМИ ИЗ БАЗЫ ---
        const users = await User.find().sort({ name: 1 });
        const visits = await Visit.find();

        users.forEach((user, index) => {
            const rowIndex = 4 + index; 
            const row = sheet.getRow(rowIndex);
            row.height = 18; // Комфортная высота строки

            row.getCell(1).value = index + 1;
            row.getCell(2).value = user.name || '';
            row.getCell(3).value = user.job || '';

            let workedDaysCount = 0;
            
            for (let day = 1; day <= daysInMonth; day++) {
                const colIndex = 3 + day;
                const currentDayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                const hasScan = visits.some(visit => 
                    visit.userId && visit.userId.toString() === user._id.toString() && 
                    visit.dateString === currentDayStr
                );

                const dayCell = row.getCell(colIndex);
                if (hasScan) {
                    dayCell.value = 8;
                    workedDaysCount++;
                } else {
                    dayCell.value = ''; // Пусто, если не было скана (сюда можно вписать "В" руками)
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

            row.getCell(colBorg).value = user.debt || '';
            row.getCell(colDniv).value = workedDaysCount; 
            row.getCell(colDniv2).value = ''; 
            row.getCell(colTarif1).value = user.tariff || 0;
            row.getCell(colTarif2).value = ''; 
            row.getCell(colDodano).value = user.bonuses || '';
            row.getCell(colUtrimano).value = user.penalties || ''; 

                        // Динамически получаем точные буквы колонок прямо из exceljs
            const dnivLetter = sheet.getCell(rowIndex, colDniv).address.replace(/[0-9]/g, ''); // Буква колонки "Днів" (AI)
            const tarifLetter = sheet.getCell(rowIndex, colTarif1).address.replace(/[0-9]/g, ''); // Буква колонки "Тариф 1" (AK)
            const dodanoLetter = sheet.getCell(rowIndex, colDodano).address.replace(/[0-9]/g, ''); // Буква колонки "Додано" (AM)
            const utrimanoLetter = sheet.getCell(rowIndex, colUtrimano).address.replace(/[0-9]/g, ''); // Буква колонки "Утримано" (AN)

            // Прописываем чистую формулу без привязки к жестким индексам: =AI4*AK4+AM4-AN4
            row.getCell(colSuma).value = {
                formula: `=${dnivLetter}${rowIndex}*${tarifLetter}${rowIndex}+${dodanoLetter}${rowIndex}-${utrimanoLetter}${rowIndex}`
            };


            row.getCell(colPrim).value = user.notes || '';

            // Стилизация финальных колонок (шрифты, выравнивание и сетка)
            for (let c = 1; c <= startFinanceCol + 8; c++) {
                const cell = row.getCell(c);
                cell.border = thinBorder;
                cell.font = { name: 'Times New Roman', size: 9 };
                if (c !== 2 && c !== 3 && c !== colPrim) { 
                    cell.alignment = { horizontal: 'center', vertical: 'middle' }; // Все цифры по центру
                } else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' }; // Текст по левому краю
                }
            }
        });

        // --- ОТПРАВКА ГОТОВОГО ФАЙЛА ---
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Tabel_${month}_${year}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Ошибка генерации красивого Excel:', error);
        res.status(500).send('Ошибка сервера при создании Excel');
    }
});


// --- ЗАПУСК СЕРВЕРА (Всегда самый конец файла) ---
app.listen(PORT, () => {
    console.log(`📡 Бэкенд-сервер успешно запущен на порту ${PORT}`);
});

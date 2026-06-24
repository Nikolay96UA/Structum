import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer'; // Добавили импорт для работы с файлами
import * as XLSX from 'xlsx'; // Добавили импорт для чтения Excel

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
    tariff: { type: Number, default: 2000 }, // Добавили тариф (по умолчанию 2000, если не указан)
    createdAt: { type: Date, default: Date.now }
});


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
            job: req.body.job 
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
// ОБНОВИТЕ ЭТОТ МАРШРУТ НА СЕРВЕРЕ:
app.post('/api/tavel/upload', upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Файл не загружен' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // Берем первый лист
        const worksheet = workbook.Sheets[sheetName];
        
        // ВАЖНО: добавили { range: 2 }, чтобы пропустить шапку и читать со строки заголовков
        const rawData = XLSX.utils.sheet_to_json(worksheet, { range: 2 });

        res.json({ success: true, data: rawData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка при обработке Excel' });
    }
});

// СХЕМА ДЛЯ ПОСЕЩЕНИЙ
const visitSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Ссылка на сотрудника
    dateString: String, // Дата в текстовом формате "2026-06-24" для легкого поиска
    scannedAt: { type: Date, default: Date.now }
});
const Visit = mongoose.model('Visit', visitSchema);

// МАРШРУТ ДЛЯ СКАНИРОВАНИЯ QR
app.post('/api/attendance/scan', async (req, res) => {
    try {
        const { userId } = req.body;

        // Проверяем валидность ID и наличие пользователя
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Некорректный формат QR-кода' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Сотрудник не найден в системе' });
        }

        // Получаем сегодняшнюю дату в формате ГГГГ-ММ-ДД (например, "2026-06-24")
        const todayStr = new Date().toISOString().split('T')[0];

        // Проверяем, не отмечался ли он уже сегодня
        const alreadyScanned = await Visit.findOne({ userId, dateString: todayStr });
        if (alreadyScanned) {
            return res.status(400).json({ message: `${user.name} уже отмечен сегодня!` });
        }

        // Записываем приход на работу
        const newVisit = new Visit({ userId, dateString: todayStr });
        await newVisit.save();

        res.json({ success: true, message: `Отмечено: ${user.name} (${user.job})` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при фиксации времени' });
    }
});


// --- ЗАПУСК СЕРВЕРА (Всегда пишется в самом конце файла!) ---
app.listen(PORT, () => {
    console.log(`📡 Бэкенд-сервер запущен на порту ${PORT}`);
});

// Схема для записи каждого факта сканирования QR-кода
const visitSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Ссылка на ID сотрудника
    dateString: String, // Дата в формате "YYYY-MM-DD" (чтобы легко группировать по дням)
    scannedAt: { type: Date, default: Date.now } // Точное время сканирования
});

const Visit = mongoose.model('Visit', visitSchema);

// Маршрут, который вызывается при сканировании QR-кода
app.post('/api/attendance/scan', async (req, res) => {
    try {
        const { userId } = req.body; // Получаем ID из QR-кода

        // Проверяем, существует ли вообще такой сотрудник в базе
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Сотрудник не найден в базе данных' });
        }

        // Получаем сегодняшнюю дату в формате "2026-06-24"
        const today = new Date().toISOString().split('T')[0];

        // Проверяем, не сканировался ли он уже сегодня (чтобы избежать дубликатов)
        const alreadyScanned = await Visit.findOne({ userId, dateString: today });
        if (alreadyScanned) {
            return res.status(400).json({ message: `Сотрудник ${user.name} уже отметился сегодня!` });
        }

        // Если всё ок, записываем посещение
        const newVisit = new Visit({ userId, dateString: today });
        await newVisit.save();

        res.json({ success: true, message: `Доступ разрешен: ${user.name}`, userName: user.name });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера при сканировании' });
    }
});

app.get('/api/attendance/report', async (req, res) => {
    try {
        const users = await User.find();
        const visits = await Visit.find(); // Берем все отметки

        // Формируем структуру табеля для фронтенда
        const reportData = users.map((user, index) => {
            // Считаем сколько раз этот пользователь отметился в базе
            const userVisits = visits.filter(v => v.userId.toString() === user._id.toString());
            const daysCount = userVisits.length;
            const totalSum = daysCount * (user.tariff || 0);

            return {
                "№ п/п": index + 1,
                "ПІБ": user.name,
                "Посада": user.job,
                "Днів": daysCount,
                "Тариф": user.tariff || 0,
                "Сума": totalSum
            };
        });

        res.json({ success: true, data: reportData });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка генерации отчета' });
    }
});

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors'; // Импортируем cors

const app = express();
const PORT = 3000;

// Разрешаем запросы с любых портов (включая Live Server 5500)
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, 'database.json');

function getDatabase() {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return [];
    }
}

function saveDatabase(data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Получить список пользователей
app.get('/api/users', (req, res) => {
    res.json(getDatabase());
});

// Добавить нового пользователя
app.post('/api/users', (req, res) => {
    const users = getDatabase();
    const newUser = {
        id: Date.now(),
        name: req.body.name,
        age: req.body.age
    };
    users.push(newUser);
    saveDatabase(users);
    res.status(201).json({ success: true, user: newUser });
});

app.listen(PORT, () => {
    console.log(`📡 Бэкенд-сервер БД запущен на порту ${PORT}`);
});

# WellPro Anomalies: quick start

Минимальный архив содержит исходный код, конфиги, маленький демо-файл данных и SQL для начального наполнения базы. Локальные библиотеки, кэши, логи, Word-документы, результаты анализа и большие реальные данные исключены.

## Что нужно установить

- Docker Desktop или локальный PostgreSQL.
- Python 3.11+.
- Node.js 20+ и npm.

## Запуск на Windows

Откройте 3 терминала в корне распакованного проекта.

### 1. База данных

```powershell
docker compose up -d db1
```

### 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

После первого запуска backend создаст таблицы. Оставьте этот терминал открытым.

### 3. Начальное наполнение БД

В новом терминале из корня проекта:

```powershell
docker compose cp .\seed_minimal.sql db1:/tmp/seed_minimal.sql
docker compose exec db1 psql -U user -d anomaly_db -f /tmp/seed_minimal.sql
```

### 4. Frontend

В новом терминале:

```powershell
cd frontend
npm install
npm run dev
```

Откройте в браузере:

```text
http://localhost:3000
```

Backend API будет доступен по адресу:

```text
http://localhost:8000
```

## Если запускаете без Docker

Создайте PostgreSQL-базу `anomaly_db` и пользователя `user` с паролем `password`, либо поменяйте строку подключения в `backend/.env`:

```text
DATABASE_URL=postgresql+asyncpg://user:password@127.0.0.1:5434/anomaly_db
```

## Данные

В архиве лежит только маленький демо-файл:

```text
backend/app/data/default.TXT
```

Большие реальные файлы не включены ради размера. Чтобы использовать свои данные, можно:

- загрузить TXT-файл через интерфейс;
- заменить `backend/app/data/default.TXT`;
- положить TXT-файлы в `backend/app/data/rig_files/cluster_223_well_510/`, если нужен поток для конкретной скважины.

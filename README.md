# WellPro Anomalies

## Описание

`WellPro Anomalies` — это веб-приложение, созданное в рамках производственной практики и содержащее Frontend на Next.js и Backend на FastAPI.

## Требования

Для локального развертывания приложения необходимо установить:

1. **Git** — для клонирования репозитория.
2. **Node.js** — для работы Frontend.
3. **Python** - для работы Backend.

### Установка зависимостей (на примере Ubuntu):

```bash
# Обновление пакетов
sudo apt update

# Установка Git
sudo apt install git -y

# Установка Python
sudo apt install -y python3-pip python3-pip-whl

# Установка Node.js
sudo apt install -y nodejs npm
```

## Локальное развертывание приложения

Для развертывания приложения необходимо:

1. Склонировать репозиторий
```
git clone https://github.com/MaksChocomint/wellpro-anomalies.git
```
2. Равертывание Backend части:
```
# Из корневой директории перейти в директорию backend
cd backend

# Установить зависимости
pip install -r requirements.txt

# Поднять веб-сервер
uvicorn main:app --reload  
```
Веб-приложение (API) будет доступно по адресу:
```
http://127.0.0.1:8000
```
3. Равертывание Frontend части

```
# Из корневой директории перейти в директорию frontend
cd frontend

# Установить зависимости
npm install

# Поднять веб-сервер
npm run dev
```
Веб-приложение будет доступно по адресу:
```
http://127.0.0.1:3000
```

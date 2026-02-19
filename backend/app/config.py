import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Заменяем любой вариант начала на правильный для asyncpg
    for prefix in ["postgres://", "postgresql://", "postgresql+psycopg2://"]:
        if DATABASE_URL.startswith(prefix):
            DATABASE_URL = DATABASE_URL.replace(prefix, "postgresql+asyncpg://", 1)
            break

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL не найден в .env")
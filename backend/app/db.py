from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.config import DATABASE_URL

# Создаем асинхронный движок
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Поставь True, если хочешь видеть SQL-логи в консоли
    pool_size=10,
    max_overflow=20
)

# Фабрика сессий
AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    expire_on_commit=False
)

# Базовый класс для моделей
Base = declarative_base()

# Зависимость для FastAPI
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
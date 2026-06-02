# Привязка TXT к буровым

Структура каталогов:

- `cluster_<номер_куста>_well_<номер_скважины>/...*.txt`

Каждый `.txt` внутри папки буровой автоматически используется бэкендом в real-time сокете `/api/v1/ws` при передаче `cluster_number` и `well_name` в query-параметрах.

Пример:

- `ws://127.0.0.1:8000/api/v1/ws?cluster_number=223&well_name=510`
- `ws://127.0.0.1:8000/api/v1/ws?cluster_number=9101&well_name=AMMAD-01-PHYS`

Демонстрационная компания `WellPro AMMAD Demo` содержит шесть отдельных
буровых установок. Каждая установка привязана к своему TXT-рейсу, скопированному
из активного участка реального файла
`cluster_122_well_120/23-26.12.2014 рейс 15.txt`. Первые пять сценариев
показывают раннюю аномалию в первых 50 точках, а шестой сценарий распределяет
связанные импульсы по всему рейсу:

- `cluster_9101_well_AMMAD-01-PHYS` / `WR-AMMAD-01-PHYS` - выход за физические пределы;
- `cluster_9102_well_AMMAD-02-SPIKES` / `WR-AMMAD-02-SPIKES` - статистические и рабочие выбросы;
- `cluster_9103_well_AMMAD-03-STUCK` / `WR-AMMAD-03-STUCK` - залипание каналов при росте глубины;
- `cluster_9104_well_AMMAD-04-OSC` / `WR-AMMAD-04-OSC` - высокочастотные колебания;
- `cluster_9105_well_AMMAD-05-MIXED` / `WR-AMMAD-05-MIXED` - смешанный сценарий;
- `cluster_9106_well_AMMAD-06-REL-PRESS` / `WR-AMMAD-06-REL-PRESS` - реалистичные импульсы давления с привязкой к расходу, нагрузке и проходке.

Файлы и отчет можно пересобрать командой:

- `python backend/app/services/generate_demo_ammad_rig.py`

Данные для существующей базы можно досоздать без очистки командой:

- `docker compose cp .\backend\app\services\seed_demo_ammad_rig.sql db1:/tmp/seed_demo_ammad_rig.sql`
- `docker compose exec db1 psql -U user -d anomaly_db -f /tmp/seed_demo_ammad_rig.sql`

Проверить текущие привязки можно через:

- `GET /api/v1/realtime/file-bindings`

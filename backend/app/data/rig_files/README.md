# Привязка TXT к буровым

Структура каталогов:

- `cluster_<номер_куста>_well_<номер_скважины>/...*.txt`

Каждый `.txt` внутри папки буровой автоматически используется бэкендом в real-time сокете `/api/v1/ws` при передаче `cluster_number` и `well_name` в query-параметрах.

Пример:

- `ws://127.0.0.1:8000/api/v1/ws?cluster_number=223&well_name=510`

Проверить текущие привязки можно через:

- `GET /api/v1/realtime/file-bindings`

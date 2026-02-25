-- Очистка (необязательно, но полезно для чистого старта)
TRUNCATE companies, fields, clusters, wells, rigs, rig_states, sensor_types, sensors, detection_methods, method_configs RESTART IDENTITY CASCADE;

-- 1. КОМПАНИЯ
INSERT INTO companies (name, created_at) VALUES ('WellPro Miners', NOW());

-- 2. МЕСТОРОЖДЕНИЯ
INSERT INTO fields (company_id, name, location)
SELECT id, name, loc FROM companies, (VALUES 
    ('Кыртаельское', 'Республика Коми'), ('Западно-Возейское', 'ЯНАО'), 
    ('Верхнекосьюнское', 'Коми'), ('Пашнинское', 'Коми'), 
    ('Тобойское', 'Коми'), ('Ярейское', 'Коми'), ('Верхнеипатское', 'Коми')
) AS f(name, loc) WHERE companies.name = 'WellPro Miners';

-- 3. КУСТЫ
INSERT INTO clusters (field_id, number)
SELECT f.id, c.num FROM fields f
JOIN (VALUES 
    ('Кыртаельское', 4), ('Кыртаельское', 209), ('Кыртаельское', 223),
    ('Западно-Возейское', 2270), ('Западно-Возейское', 2625),
    ('Верхнекосьюнское', 122), ('Пашнинское', 561), ('Тобойское', 3),
    ('Ярейское', 2), ('Верхнеипатское', 1)
) AS c(f_name, num) ON f.name = c.f_name;

-- 4. СКВАЖИНЫ (Связь Well -> Cluster)
INSERT INTO wells (cluster_id, name, depth_target, status, started_at)
SELECT cl.id, w.name, w.depth, 'drilling', NOW() FROM clusters cl
JOIN (VALUES 
    (209, '505', 3500), (223, '510', 3400), (4, '515', 3600),
    (2270, '800', 4200), (2625, '801', 4300), (122, '120', 3000),
    (561, '562', 3100), (3, '150', 2800), (2, '207', 2900), (1, '11', 2700)
) AS w(c_num, name, depth) ON cl.number = w.c_num;

-- 5. БУРОВЫЕ (Связь Rig -> Well)
INSERT INTO rigs (well_id, name, model)
SELECT id, 'WR-' || name, 'УРАЛМАШ-5000' FROM wells;

-- 6. СОСТОЯНИЯ БУРОВЫХ
INSERT INTO rig_states (rig_id, state_name, started_at)
SELECT id, 'drilling', NOW() FROM rigs;

-- 7. ТИПЫ ДАТЧИКОВ
INSERT INTO sensor_types (name, unit) VALUES 
('глубина','м'), ('скорость_бурения','м/ч'), ('вес_на_крюке','т'), 
('момент_ротора','кНм'), ('обороты_ротора','об/мин'), ('давление_на_входе','бар'), 
('расход_на_входе','л/с'), ('температура_на_выходе','°C'), ('уровень_в_емкости','м'), 
('скорость_спо','м/с'), ('нагрузка','т'), ('дмк','мм');

-- 8. ДАТЧИКИ (12 штук на каждую из 10 буровых = 120 записей)
INSERT INTO sensors (rig_id, sensor_type_id, serial_number, installed_at)
SELECT r.id, st.id, 'SN-' || r.id || '-' || st.id, NOW()
FROM rigs r CROSS JOIN sensor_types st;

-- 9. МЕТОДЫ ДЕТЕКЦИИ
INSERT INTO detection_methods (name, description) VALUES 
('z_score', 'Классический статистический метод на основе стандартного отклонения.'), 
('lof', 'Метод локальной плотности.'), 
('fft', 'Частотный анализ сигнала.'), 
('ammad', 'Adaptive Multi-Method Anomaly Detection.');

-- 10. КОНФИГУРАЦИИ МЕТОДОВ (AMMAD для каждой буровой)
INSERT INTO method_configs (rig_id, method_id, window_size, threshold, created_at)
SELECT r.id, m.id, 32, 0.75, NOW() 
FROM rigs r JOIN detection_methods m ON m.name = 'ammad';
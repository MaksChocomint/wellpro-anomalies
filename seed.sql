-- Очистка для чистого старта демонстрационной базы
TRUNCATE companies, fields, clusters, wells, rigs, rig_states, sensor_types, sensors, detection_methods, method_configs RESTART IDENTITY CASCADE;

-- 1. КОМПАНИИ
INSERT INTO companies (name, created_at) VALUES
('WellPro Miners', NOW()),
('WellPro AMMAD Demo', NOW());

-- 2. МЕСТОРОЖДЕНИЯ
INSERT INTO fields (company_id, name, location)
SELECT c.company_id, f.name, f.location
FROM companies c
JOIN (VALUES
    ('WellPro Miners', 'Кыртаельское', 'Республика Коми'),
    ('WellPro Miners', 'Западно-Возейское', 'ЯНАО'),
    ('WellPro Miners', 'Верхнекосьюнское', 'Коми'),
    ('WellPro Miners', 'Пашнинское', 'Коми'),
    ('WellPro Miners', 'Тобойское', 'Коми'),
    ('WellPro Miners', 'Ярейское', 'Коми'),
    ('WellPro Miners', 'Верхнеипатское', 'Коми'),
    ('WellPro AMMAD Demo', 'Демонстрационный полигон AMMAD', 'Учебный контур')
) AS f(company_name, name, location) ON c.name = f.company_name;

-- 3. КУСТЫ
INSERT INTO clusters (field_id, number)
SELECT f.field_id, c.number
FROM fields f
JOIN companies co ON co.company_id = f.company_id
JOIN (VALUES
    ('WellPro Miners', 'Кыртаельское', 4),
    ('WellPro Miners', 'Кыртаельское', 209),
    ('WellPro Miners', 'Кыртаельское', 223),
    ('WellPro Miners', 'Западно-Возейское', 2270),
    ('WellPro Miners', 'Западно-Возейское', 2625),
    ('WellPro Miners', 'Верхнекосьюнское', 122),
    ('WellPro Miners', 'Пашнинское', 561),
    ('WellPro Miners', 'Тобойское', 3),
    ('WellPro Miners', 'Ярейское', 2),
    ('WellPro Miners', 'Верхнеипатское', 1),
    ('WellPro AMMAD Demo', 'Демонстрационный полигон AMMAD', 9101),
    ('WellPro AMMAD Demo', 'Демонстрационный полигон AMMAD', 9102),
    ('WellPro AMMAD Demo', 'Демонстрационный полигон AMMAD', 9103),
    ('WellPro AMMAD Demo', 'Демонстрационный полигон AMMAD', 9104),
    ('WellPro AMMAD Demo', 'Демонстрационный полигон AMMAD', 9105),
    ('WellPro AMMAD Demo', 'Демонстрационный полигон AMMAD', 9106)
) AS c(company_name, field_name, number)
    ON co.name = c.company_name AND f.name = c.field_name;

-- 4. СКВАЖИНЫ
INSERT INTO wells (cluster_id, name, depth_target, status, started_at)
SELECT cl.cluster_id, w.name, w.depth_target, 'drilling', NOW()
FROM clusters cl
JOIN fields f ON f.field_id = cl.field_id
JOIN companies co ON co.company_id = f.company_id
JOIN (VALUES
    ('WellPro Miners', 209, '505', 3500),
    ('WellPro Miners', 223, '510', 3400),
    ('WellPro Miners', 4, '515', 3600),
    ('WellPro Miners', 2270, '800', 4200),
    ('WellPro Miners', 2625, '801', 4300),
    ('WellPro Miners', 122, '120', 3000),
    ('WellPro Miners', 561, '562', 3100),
    ('WellPro Miners', 3, '150', 2800),
    ('WellPro Miners', 2, '207', 2900),
    ('WellPro Miners', 1, '11', 2700),
    ('WellPro AMMAD Demo', 9101, 'AMMAD-01-PHYS', 3600),
    ('WellPro AMMAD Demo', 9102, 'AMMAD-02-SPIKES', 3600),
    ('WellPro AMMAD Demo', 9103, 'AMMAD-03-STUCK', 3600),
    ('WellPro AMMAD Demo', 9104, 'AMMAD-04-OSC', 3600),
    ('WellPro AMMAD Demo', 9105, 'AMMAD-05-MIXED', 3600),
    ('WellPro AMMAD Demo', 9106, 'AMMAD-06-REL-PRESS', 3600)
) AS w(company_name, cluster_number, name, depth_target)
    ON co.name = w.company_name AND cl.number = w.cluster_number;

-- 5. БУРОВЫЕ
INSERT INTO rigs (well_id, name, model, created_at)
SELECT w.well_id, r.name, r.model, NOW()
FROM wells w
JOIN clusters cl ON cl.cluster_id = w.cluster_id
JOIN fields f ON f.field_id = cl.field_id
JOIN companies co ON co.company_id = f.company_id
JOIN (VALUES
    ('WellPro Miners', '505', 'WR-505', 'УРАЛМАШ-5000'),
    ('WellPro Miners', '510', 'WR-510', 'УРАЛМАШ-5000'),
    ('WellPro Miners', '515', 'WR-515', 'УРАЛМАШ-5000'),
    ('WellPro Miners', '800', 'WR-800', 'УРАЛМАШ-5000'),
    ('WellPro Miners', '801', 'WR-801', 'УРАЛМАШ-5000'),
    ('WellPro Miners', '120', 'WR-120', 'УРАЛМАШ-5000'),
    ('WellPro Miners', '562', 'WR-562', 'УРАЛМАШ-5000'),
    ('WellPro Miners', '150', 'WR-150', 'УРАЛМАШ-5000'),
    ('WellPro Miners', '207', 'WR-207', 'УРАЛМАШ-5000'),
    ('WellPro Miners', '11', 'WR-11', 'УРАЛМАШ-5000'),
    ('WellPro AMMAD Demo', 'AMMAD-01-PHYS', 'WR-AMMAD-01-PHYS', 'AMMAD физ. пределы'),
    ('WellPro AMMAD Demo', 'AMMAD-02-SPIKES', 'WR-AMMAD-02-SPIKES', 'AMMAD стат. выбросы'),
    ('WellPro AMMAD Demo', 'AMMAD-03-STUCK', 'WR-AMMAD-03-STUCK', 'AMMAD залипание'),
    ('WellPro AMMAD Demo', 'AMMAD-04-OSC', 'WR-AMMAD-04-OSC', 'AMMAD колебания'),
    ('WellPro AMMAD Demo', 'AMMAD-05-MIXED', 'WR-AMMAD-05-MIXED', 'AMMAD смешанный'),
    ('WellPro AMMAD Demo', 'AMMAD-06-REL-PRESS', 'WR-AMMAD-06-REL-PRESS', 'AMMAD связ. давление')
) AS r(company_name, well_name, name, model)
    ON co.name = r.company_name AND w.name = r.well_name;

-- 6. СОСТОЯНИЯ БУРОВЫХ
INSERT INTO rig_states (rig_id, state_name, started_at)
SELECT rig_id, 'DRILLING', NOW()
FROM rigs;

-- 7. ТИПЫ ДАТЧИКОВ
INSERT INTO sensor_types (name, unit) VALUES
('глубина','м'),
('скорость_бурения','м/ч'),
('вес_на_крюке','т'),
('момент_ротора','кНм'),
('обороты_ротора','об/мин'),
('давление_на_входе','бар'),
('расход_на_входе','л/с'),
('температура_на_выходе','°C'),
('уровень_в_емкости','м'),
('скорость_спо','м/с'),
('нагрузка','т'),
('дмк','мм');

-- 8. ДАТЧИКИ
INSERT INTO sensors (rig_id, sensor_type_id, serial_number, installed_at)
SELECT r.rig_id, st.sensor_type_id, 'SN-' || r.rig_id || '-' || st.sensor_type_id, NOW()
FROM rigs r
CROSS JOIN sensor_types st;

-- 9. МЕТОДЫ ДЕТЕКЦИИ
INSERT INTO detection_methods (name, description) VALUES
('z_score', 'Классический статистический метод на основе стандартного отклонения.'),
('lof', 'Метод локальной плотности.'),
('fft', 'Частотный анализ сигнала.'),
('ammad', 'Adaptive Multi-Method Anomaly Detection.');

-- 10. КОНФИГУРАЦИИ МЕТОДОВ
INSERT INTO method_configs (rig_id, method_id, window_size, threshold, created_at)
SELECT r.rig_id, m.method_id, 32, 0.75, NOW()
FROM rigs r
JOIN detection_methods m ON m.name = 'ammad';

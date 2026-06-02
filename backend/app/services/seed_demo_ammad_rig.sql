-- Adds the six AMMAD demo rigs to an existing database.
-- The script is non-destructive for real objects, but removes the old
-- single-rig demo created under WellPro Miners to avoid duplicate choices.

DELETE FROM fields f
USING companies c
WHERE f.company_id = c.company_id
  AND c.name = 'WellPro Miners'
  AND f.name = 'Демонстрационные данные';

INSERT INTO companies (name, created_at)
VALUES ('WellPro AMMAD Demo', NOW())
ON CONFLICT (name) DO NOTHING;

INSERT INTO fields (company_id, name, location)
SELECT company_id, 'Демонстрационный полигон AMMAD', 'Учебный контур'
FROM companies
WHERE name = 'WellPro AMMAD Demo'
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO clusters (field_id, number)
SELECT f.field_id, demo.cluster_number
FROM fields f
JOIN companies c ON c.company_id = f.company_id
CROSS JOIN (VALUES
    (9101),
    (9102),
    (9103),
    (9104),
    (9105),
    (9106)
) AS demo(cluster_number)
WHERE c.name = 'WellPro AMMAD Demo'
  AND f.name = 'Демонстрационный полигон AMMAD'
ON CONFLICT (field_id, number) DO NOTHING;

INSERT INTO wells (cluster_id, name, depth_target, status, started_at)
SELECT cl.cluster_id, demo.well_name, 3600, 'drilling', NOW()
FROM clusters cl
JOIN fields f ON f.field_id = cl.field_id
JOIN companies c ON c.company_id = f.company_id
JOIN (VALUES
    (9101, 'AMMAD-01-PHYS'),
    (9102, 'AMMAD-02-SPIKES'),
    (9103, 'AMMAD-03-STUCK'),
    (9104, 'AMMAD-04-OSC'),
    (9105, 'AMMAD-05-MIXED'),
    (9106, 'AMMAD-06-REL-PRESS')
) AS demo(cluster_number, well_name)
    ON demo.cluster_number = cl.number
WHERE c.name = 'WellPro AMMAD Demo'
  AND f.name = 'Демонстрационный полигон AMMAD'
  AND NOT EXISTS (
    SELECT 1
    FROM wells w
    WHERE w.cluster_id = cl.cluster_id
      AND w.name = demo.well_name
  );

INSERT INTO rigs (well_id, name, model, created_at)
SELECT w.well_id, demo.rig_name, demo.model, NOW()
FROM wells w
JOIN clusters cl ON cl.cluster_id = w.cluster_id
JOIN fields f ON f.field_id = cl.field_id
JOIN companies c ON c.company_id = f.company_id
JOIN (VALUES
    ('AMMAD-01-PHYS', 'WR-AMMAD-01-PHYS', 'AMMAD физ. пределы'),
    ('AMMAD-02-SPIKES', 'WR-AMMAD-02-SPIKES', 'AMMAD стат. выбросы'),
    ('AMMAD-03-STUCK', 'WR-AMMAD-03-STUCK', 'AMMAD залипание'),
    ('AMMAD-04-OSC', 'WR-AMMAD-04-OSC', 'AMMAD колебания'),
    ('AMMAD-05-MIXED', 'WR-AMMAD-05-MIXED', 'AMMAD смешанный'),
    ('AMMAD-06-REL-PRESS', 'WR-AMMAD-06-REL-PRESS', 'AMMAD связ. давление')
) AS demo(well_name, rig_name, model)
    ON demo.well_name = w.name
WHERE c.name = 'WellPro AMMAD Demo'
  AND f.name = 'Демонстрационный полигон AMMAD'
  AND NOT EXISTS (
    SELECT 1
    FROM rigs r
    WHERE r.well_id = w.well_id
      AND r.name = demo.rig_name
  );

UPDATE rigs AS r
SET model = demo.model
FROM wells w
JOIN clusters cl ON cl.cluster_id = w.cluster_id
JOIN fields f ON f.field_id = cl.field_id
JOIN companies c ON c.company_id = f.company_id
JOIN (VALUES
    ('AMMAD-01-PHYS', 'WR-AMMAD-01-PHYS', 'AMMAD физ. пределы'),
    ('AMMAD-02-SPIKES', 'WR-AMMAD-02-SPIKES', 'AMMAD стат. выбросы'),
    ('AMMAD-03-STUCK', 'WR-AMMAD-03-STUCK', 'AMMAD залипание'),
    ('AMMAD-04-OSC', 'WR-AMMAD-04-OSC', 'AMMAD колебания'),
    ('AMMAD-05-MIXED', 'WR-AMMAD-05-MIXED', 'AMMAD смешанный'),
    ('AMMAD-06-REL-PRESS', 'WR-AMMAD-06-REL-PRESS', 'AMMAD связ. давление')
) AS demo(well_name, rig_name, model)
    ON demo.well_name = w.name
WHERE r.well_id = w.well_id
  AND r.name = demo.rig_name
  AND c.name = 'WellPro AMMAD Demo'
  AND f.name = 'Демонстрационный полигон AMMAD';

INSERT INTO rig_states (rig_id, state_name, started_at)
SELECT r.rig_id, 'DRILLING', NOW()
FROM rigs r
JOIN wells w ON w.well_id = r.well_id
JOIN clusters cl ON cl.cluster_id = w.cluster_id
JOIN fields f ON f.field_id = cl.field_id
JOIN companies c ON c.company_id = f.company_id
WHERE c.name = 'WellPro AMMAD Demo'
  AND f.name = 'Демонстрационный полигон AMMAD'
  AND NOT EXISTS (
    SELECT 1
    FROM rig_states rs
    WHERE rs.rig_id = r.rig_id
      AND rs.state_name = 'DRILLING'
  );

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
('дмк','мм')
ON CONFLICT (name) DO NOTHING;

INSERT INTO sensors (rig_id, sensor_type_id, serial_number, installed_at)
SELECT r.rig_id, st.sensor_type_id, 'SN-' || r.rig_id || '-' || st.sensor_type_id, NOW()
FROM rigs r
JOIN wells w ON w.well_id = r.well_id
JOIN clusters cl ON cl.cluster_id = w.cluster_id
JOIN fields f ON f.field_id = cl.field_id
JOIN companies c ON c.company_id = f.company_id
CROSS JOIN sensor_types st
WHERE c.name = 'WellPro AMMAD Demo'
  AND f.name = 'Демонстрационный полигон AMMAD'
  AND st.name IN (
    'глубина',
    'скорость_бурения',
    'вес_на_крюке',
    'момент_ротора',
    'обороты_ротора',
    'давление_на_входе',
    'расход_на_входе',
    'температура_на_выходе',
    'уровень_в_емкости',
    'скорость_спо',
    'нагрузка',
    'дмк'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM sensors s
    WHERE s.rig_id = r.rig_id
      AND s.sensor_type_id = st.sensor_type_id
  );

INSERT INTO detection_methods (name, description) VALUES
('z_score', 'Классический статистический метод на основе стандартного отклонения.'),
('lof', 'Метод локальной плотности.'),
('fft', 'Частотный анализ сигнала.'),
('ammad', 'Adaptive Multi-Method Anomaly Detection.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO method_configs (rig_id, method_id, window_size, threshold, created_at)
SELECT r.rig_id, m.method_id, 32, 0.75, NOW()
FROM rigs r
JOIN wells w ON w.well_id = r.well_id
JOIN clusters cl ON cl.cluster_id = w.cluster_id
JOIN fields f ON f.field_id = cl.field_id
JOIN companies c ON c.company_id = f.company_id
JOIN detection_methods m ON m.name = 'ammad'
WHERE c.name = 'WellPro AMMAD Demo'
  AND f.name = 'Демонстрационный полигон AMMAD'
  AND NOT EXISTS (
    SELECT 1
    FROM method_configs mc
    WHERE mc.rig_id = r.rig_id
      AND mc.method_id = m.method_id
      AND mc.window_size = 32
      AND mc.threshold = 0.75
  );

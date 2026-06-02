# Demo AMMAD Rig Method Comparison

Generated at: 2026-05-28 21:31:18
Source active section: `D:\diploma\wellpro-anomalies\backend\app\data\rig_files\cluster_122_well_120\23-26.12.2014 рейс 15.txt`
Demo rig files root: `D:\diploma\wellpro-anomalies\backend\app\data\rig_files`

| Cluster | Well | Rig | File | Scenario | Injected rows | Z-score | LOF | FFT | AMMAD | AMMAD first index |
| ---: | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 9101 | AMMAD-01-PHYS | WR-AMMAD-01-PHYS | 01_physical_limits_first50.txt | Физические пределы | 0-45 | 54 (25) | 5 (0) | 18 (0) | 88 (55) | 0 |
| 9102 | AMMAD-02-SPIKES | WR-AMMAD-02-SPIKES | 02_statistical_spikes_first50.txt | Статистические и рабочие выбросы | 0-5, 18-23, 32-37 | 33 (0) | 3 (0) | 18 (0) | 38 (5) | 16 |
| 9103 | AMMAD-03-STUCK | WR-AMMAD-03-STUCK | 03_context_stuck_sensors_first50.txt | Контекстное залипание каналов при росте глубины | 0-49 | 46 (0) | 3 (0) | 18 (0) | 66 (32) | 10 |
| 9104 | AMMAD-04-OSC | WR-AMMAD-04-OSC | 04_fft_oscillations_starts_first50.txt | Высокочастотные колебания | 0-91 | 27 (0) | 0 (0) | 64 (0) | 91 (40) | 0 |
| 9105 | AMMAD-05-MIXED | WR-AMMAD-05-MIXED | 05_mixed_all_types_first50.txt | Смешанный сценарий | 0-95 | 41 (6) | 4 (0) | 25 (0) | 49 (20) | 0 |
| 9106 | AMMAD-06-REL-PRESS | WR-AMMAD-06-REL-PRESS | 06_related_pressure_events.txt | Связанные импульсы давления | 26-36, 74-87, 121-132, 167-179, 208-218 | 41 (4) | 3 (0) | 5 (0) | 42 (8) | 10 |

Values in parentheses are detections inside the first 50 rows.

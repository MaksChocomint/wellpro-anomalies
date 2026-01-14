# Оптимальные параметры методов обнаружения аномалий
# Сгенерировано автоматически на основе оптимизации

OPTIMAL_PARAMETERS = {
    "z-score": {
        "window_size": 30,
        "threshold": 3.0,
        "expected_anomaly_percentage": 2.04,
        "score": 8.78
    },
    "lof": {
        "window_size": 70,
        "threshold": 35,
        "expected_anomaly_percentage": 3.31,
        "score": 8.83
    },
    "fft": {
        "window_size": 64,
        "threshold": 0.2,
        "expected_anomaly_percentage": 1.34,
        "score": 6.67
    },
    "ammad": {
        "window_size": 32,
        "threshold": 0.5,
        "expected_anomaly_percentage": 5.46,
        "score": 6.75
    },
}

# Для использования в main.py или methods.py:
def get_optimal_parameters(method: str):
    """
    Получение оптимальных параметров для метода.
    
    Args:
        method: Название метода ('z_score', 'lof', 'fft', 'ammad')
    
    Returns:
        Словарь с оптимальными параметрами
    """
    method = method.lower()
    if method in OPTIMAL_PARAMETERS:
        return OPTIMAL_PARAMETERS[method]
    else:
        # Параметры по умолчанию
        return {
            "window_size": 64,
            "threshold": 0.7 if method == "ammad" else 0.5,
            "expected_anomaly_percentage": 3.0,
            "score": 5.0
        }

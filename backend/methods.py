import heapq
import math

import numpy as np

Z_SCORE_THRESHOLD = 3
LOF_SCORE_THRESHOLD = 25
FFT_SCORE_THRESHOLD = 0.3

Z_SCORE_WINDOW_SIZE = 50
LOF_WINDOW_SIZE = 50
FFT_WINDOW_SIZE = 64
K_LOF = 5
EPS = 1e-6


async def z_score(data, window_size=Z_SCORE_WINDOW_SIZE, score_threshold=Z_SCORE_THRESHOLD):
    if len(data) <= window_size:
        return False
    window = list(data)[-window_size - 1:-1]
    mean = sum(window) / len(window)
    variance = sum((x - mean) ** 2 for x in window) / (len(window) - 1)
    std = math.sqrt(variance)
    if std == 0:
        return False
    return abs((data[-1] - mean) / std) > score_threshold


async def lof(data, window_size=LOF_WINDOW_SIZE, score_threshold=LOF_SCORE_THRESHOLD):
    if len(data) <= window_size:
        return False

    window = list(data)[-window_size - 1:-1]
    last_value = data[-1]

    if all(abs(v - window[0]) < EPS for v in window) and abs(last_value - window[0]) < EPS:
        return False

    def local_reach_density(point, arr):
        neighbors = heapq.nsmallest(K_LOF, arr, key=lambda x: abs(x - point))
        mean_dist = sum(abs(n - point) for n in neighbors) / len(neighbors)
        return min(1 / max(mean_dist, EPS), 1e3)

    lrd_last = local_reach_density(last_value, window)
    neighbors = heapq.nsmallest(K_LOF, window, key=lambda x: abs(x - last_value))
    lof_score = sum(local_reach_density(n, window) / lrd_last for n in neighbors) / len(neighbors)
    return lof_score > score_threshold


async def fft(data, window_size=FFT_WINDOW_SIZE, score_threshold=FFT_SCORE_THRESHOLD):
    if len(data) < window_size:
        return False
    window = np.array(list(data)[-window_size - 1:-1])
    fft_vals = np.fft.fft(window)
    magnitudes = np.abs(fft_vals)
    total = magnitudes.sum()
    if total == 0:
        return False
    high_freq_ratio = magnitudes[window_size // 4: window_size // 2].sum() / total
    return bool(high_freq_ratio > score_threshold)


METHODS = {
    "z_score": z_score,
    "lof": lof,
    "fft": fft,
}

"""
Analysis utilities for WellPro backend.
Handles WebSocket communication, parameter management, and data buffering.
"""

import json
from collections import defaultdict, deque
from typing import Dict, Optional, Callable
from fastapi import WebSocket

from methods import METHODS


class AnalysisState:
    """Manages analysis parameters and state for WebSocket connection."""
    
    def __init__(self, default_window_size: int = 50):
        self.method = "fft"
        self.window_size = default_window_size
        self.score_threshold = 0.5
        self.data_buffers: Dict[str, deque] = defaultdict(
            lambda: deque(maxlen=default_window_size + 1)
        )
        self.method_params = {
            "window_size": default_window_size,
            "score_threshold": 0.5
        }
    
    def update_method(self, method: str) -> bool:
        """
        Update analysis method.
        
        Args:
            method: Method name ("fft", "z_score", "lof")
        
        Returns:
            True if method changed, False if invalid
        """
        method = method.lower()
        if method not in METHODS:
            return False
        
        if method != self.method:
            self.method = method
            # Clear buffers on method change
            self.data_buffers.clear()
            self.data_buffers = defaultdict(
                lambda: deque(maxlen=self.window_size + 1)
            )
        
        return True
    
    def update_window_size(self, window_size: int) -> bool:
        """
        Update analysis window size.
        
        Args:
            window_size: New window size
        
        Returns:
            True if updated, False if invalid
        """
        if window_size is None or window_size < 0:
            return False
        
        if window_size != self.window_size:
            self.window_size = window_size
            self.method_params["window_size"] = window_size
            
            # Update buffer sizes
            for key in list(self.data_buffers.keys()):
                old_buffer = list(self.data_buffers[key])
                self.data_buffers[key] = deque(old_buffer, maxlen=window_size + 1)
        
        return True
    
    def update_score_threshold(self, score_threshold: float) -> bool:
        """
        Update analysis score threshold.
        
        Args:
            score_threshold: New threshold value
        
        Returns:
            True if updated, False if invalid
        """
        if score_threshold is None or score_threshold < 0:
            return False
        
        if score_threshold != self.score_threshold:
            self.score_threshold = score_threshold
            self.method_params["score_threshold"] = score_threshold
        
        return True
    
    def get_method_params(self) -> Dict:
        """Get current method parameters."""
        return self.method_params.copy()


async def handle_websocket_message(
    message: str,
    analysis_state: AnalysisState,
    on_error: Optional[Callable] = None
) -> bool:
    """
    Parse and handle WebSocket message with parameter updates.
    
    Args:
        message: JSON message from client
        analysis_state: Current analysis state
        on_error: Optional error callback
    
    Returns:
        True if successful, False if error
    """
    try:
        data = json.loads(message)
        print(f"[WebSocketHandler] Received message: {data}")
        
        # Update method
        if "method" in data:
            if not analysis_state.update_method(data["method"]):
                print(f"[WebSocketHandler] Invalid method: {data['method']}")
                return False
            print(f"[WebSocketHandler] Method changed to: {analysis_state.method}")
        
        # Update window size
        if "window_size" in data:
            if not analysis_state.update_window_size(data["window_size"]):
                print(f"[WebSocketHandler] Invalid window size: {data['window_size']}")
                return False
            print(f"[WebSocketHandler] Window size changed to: {analysis_state.window_size}")
        
        # Update score threshold
        if "score_threshold" in data:
            if not analysis_state.update_score_threshold(data["score_threshold"]):
                print(f"[WebSocketHandler] Invalid score threshold: {data['score_threshold']}")
                return False
            print(f"[WebSocketHandler] Score threshold changed to: {analysis_state.score_threshold}")
        
        # Legacy parameter updates (for backward compatibility)
        if "FFT" in data and analysis_state.method == "fft":
            analysis_state.update_score_threshold(data["FFT"])
        elif "Z_score" in data and analysis_state.method == "z_score":
            analysis_state.update_score_threshold(data["Z_score"])
        elif "LOF" in data and analysis_state.method == "lof":
            analysis_state.update_score_threshold(data["LOF"])
        
        return True
    
    except json.JSONDecodeError as e:
        print(f"[WebSocketHandler] Invalid JSON: {e}")
        if on_error:
            on_error(f"Invalid JSON: {e}")
        return False
    except Exception as e:
        print(f"[WebSocketHandler] Error handling message: {e}")
        if on_error:
            on_error(f"Error: {e}")
        return False


async def apply_analysis_method(
    param_name: str,
    data_buffer: deque,
    method: str,
    method_params: Dict
) -> bool:
    """
    Apply anomaly detection method to parameter data.
    
    Args:
        param_name: Parameter name (for logging)
        data_buffer: Deque with parameter values
        method: Method name
        method_params: Method parameters
    
    Returns:
        True if anomaly detected, False otherwise
    """
    if method not in METHODS:
        print(f"[Analysis] Unknown method: {method}")
        return False
    
    if len(data_buffer) < 2:
        return False
    
    try:
        is_anomaly = await METHODS[method](
            list(data_buffer),
            **method_params
        )
        return is_anomaly
    except Exception as e:
        print(f"[Analysis] Error in {method} for {param_name}: {e}")
        return False

"""
Data utilities for WellPro backend.
Handles parsing, filtering, and data transformation.
"""

from io import StringIO
from typing import Dict, List, Optional
import pandas as pd


# 12 Key drilling parameters for WellPro
REQUIRED_PARAMETERS = {
    "глубина",                    # Depth
    "скорость_бурения",           # Drilling Rate
    "вес_на_крюке",               # Hook Load
    "момент_ротора",              # Torque
    "обороты_ротора",             # RPM
    "давление_на_входе",          # Inlet Pressure
    "расход_на_входе",            # Flow In
    "температура_на_выходе",      # Outlet Temperature
    "уровень_в_емкости",          # Tank Level
    "скорость_спо",               # ROP SPO
    "нагрузка",                   # Weight on Bit
    "дмк",                        # DMK
}

# Parameter ranges for validation
PARAMETER_RANGES = {
    "глубина": (0, 10000),                      # 0-10000 meters
    "скорость_бурения": (0, 300),               # 0-300 m/h
    "вес_на_крюке": (0, 1000),                  # 0-1000 tons
    "момент_ротора": (0, 1000),                 # 0-1000 kNm
    "обороты_ротора": (0, 300),                 # 0-300 RPM
    "давление_на_входе": (0, 500),              # 0-500 bar
    "расход_на_входе": (0, 2000),               # 0-2000 l/min
    "температура_на_выходе": (-20, 100),        # -20 to 100°C
    "уровень_в_емкости": (0, 100),              # 0-100%
    "скорость_спо": (0, 300),                   # 0-300 m/h
    "нагрузка": (0, 500),                       # 0-500 tons
    "дмк": (0, 10),                             # 0-10 mm
}

# Inertia levels: "very_high", "high", "medium", "low", "very_low"
PARAMETER_INERTIA = {
    "глубина": "very_high",
    "скорость_бурения": "high",
    "вес_на_крюке": "high",
    "момент_ротора": "low",
    "обороты_ротора": "very_low",
    "давление_на_входе": "medium",
    "расход_на_входе": "low",
    "температура_на_выходе": "very_high",
    "уровень_в_емкости": "medium",
    "скорость_спо": "high",
    "нагрузка": "high",
    "дмк": "very_high",
}


async def parse_data(text: Optional[bytes] = None, filename: str = "default.TXT") -> Optional[List[Dict]]:
    """
    Parse drilling data from tab-separated file.
    Skips first 2 header rows and extracts data starting from row 3.
    
    Args:
        text: File content as bytes. If None, reads from filename.
        filename: Default filename to read if text is None.
    
    Returns:
        List of dictionaries with 12 required parameters + time, or None if parsing fails.
    """
    try:
        if text is None:
            with open(filename, 'rb') as file:
                text = file.read()
        
        # Decode and split lines
        lines = text.decode("utf-8").strip().split('\n')
        
        # Line 0: "Начало рейса - ..." (skip)
        # Line 1: "Окончание рейса - ..." (skip)
        # Line 2: Headers
        # Line 3+: Data
        
        if len(lines) < 3:
            print("[DataParser] Error: File has less than 3 lines")
            return None
        
        # Read from line 2 (0-indexed) which is the header row
        df = pd.read_csv(
            StringIO('\n'.join(lines[2:])),
            sep='\t',
            header=0,
            decimal=',',
            dtype=float
        )
        
        # Normalize column names to lowercase
        df.columns = df.columns.str.lower()
        df.columns = df.columns.str.strip()
        
        # Check for required time column
        if 'время' not in df.columns:
            print("[DataParser] Error: 'время' column not found")
            print(f"[DataParser] Available columns: {df.columns.tolist()}")
            return None
        
        # Convert to records and filter to required parameters
        data = df.to_dict(orient="records")
        print(f"[DataParser] Successfully parsed {len(data)} records")
        print(f"[DataParser] Found {len(df.columns)} columns, keeping 12 required parameters + time")
        
        return data
    
    except Exception as e:
        print(f"[DataParser] Error parsing data: {e}")
        import traceback
        traceback.print_exc()
        return None


def filter_required_parameters(data: List[Dict]) -> List[Dict]:
    """
    Filter data to keep only 12 required parameters and 'время'.
    Handles missing parameters gracefully.
    
    Args:
        data: List of data records (with all columns from file)
    
    Returns:
        Filtered data with only required parameters + time
    """
    if not data:
        return []
    
    filtered = []
    missing_params = set()
    
    for idx, record in enumerate(data):
        filtered_record = {}
        
        # Always include time
        if "время" in record:
            filtered_record["время"] = record["время"]
        
        # Extract only required parameters
        for param in REQUIRED_PARAMETERS:
            if param in record:
                value = record[param]
                # Handle NaN and invalid values
                if pd.notna(value):
                    filtered_record[param] = value
            else:
                if idx == 0:  # Report missing once
                    missing_params.add(param)
        
        filtered.append(filtered_record)
    
    # Report status
    found_params = sum(1 for p in REQUIRED_PARAMETERS if any(p in r for r in filtered))
    if missing_params:
        print(f"[DataParser] Warning: {len(missing_params)} expected parameters not found: {missing_params}")
    print(f"[DataParser] Filtered to {found_params}/12 required parameters + time")
    
    return filtered


def validate_parameter_value(param_name: str, value: float) -> bool:
    """
    Check if parameter value is within valid range.
    
    Args:
        param_name: Parameter name
        value: Parameter value
    
    Returns:
        True if valid, False otherwise
    """
    if param_name not in PARAMETER_RANGES:
        return True  # Unknown parameter, assume valid
    
    min_val, max_val = PARAMETER_RANGES[param_name]
    return min_val <= value <= max_val


def get_parameter_inertia(param_name: str) -> str:
    """
    Get inertia level for parameter.
    
    Args:
        param_name: Parameter name
    
    Returns:
        Inertia level string
    """
    return PARAMETER_INERTIA.get(param_name, "medium")

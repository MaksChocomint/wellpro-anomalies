# WellPro Documentation Index

## 📚 Complete Documentation Set

### Quick Navigation

**New to WellPro?** Start here → [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

**Want architecture details?** → [README.md](README.md)

**Need parameter info?** → [PARAMETERS_INFO.md](PARAMETERS_INFO.md)

**Understand the refactoring?** → [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md)

**Want visual diagrams?** → [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)

---

## 📖 Documentation Files Explained

### 1. **README.md** - Backend Architecture Guide

**Best for:** Understanding system structure and how it works

**Contains:**

- Project structure overview
- File descriptions (main.py, methods.py, data_utils.py, analysis_utils.py)
- Design patterns used
- API endpoint documentation
- Configuration guide
- Dependencies list
- Future improvements ideas

**Read time:** ~15 minutes

**Audience:** Backend developers, DevOps, technical leads

---

### 2. **PARAMETERS_INFO.md** - Comprehensive Parameter Reference

**Best for:** Understanding drilling parameters and their behavior

**Contains:**

- Overview of WellPro system and architecture
- 12 drilling parameters with full documentation:
  - Normal behavior ranges
  - Inertia levels
  - Acceptable sudden changes
  - Relationships with other parameters
- 3 analysis algorithms (FFT, Z-score, LOF)
- Anomaly detection logic
- Critical combinations
- Monitoring recommendations

**Read time:** ~30 minutes (can be read section-by-section)

**Audience:** Domain experts, drilling engineers, analysts, backend developers

---

### 3. **QUICK_REFERENCE.md** - Quick Guide for Developers

**Best for:** Getting started quickly and understanding key concepts

**Contains:**

- Before/after refactoring comparison
- 12 parameters in table format
- Architecture benefits
- Code examples for common tasks
- Quick start instructions
- Support section

**Read time:** ~10 minutes

**Audience:** All developers working with WellPro

---

### 4. **REFACTORING_SUMMARY.md** - Refactoring Details

**Best for:** Understanding what changed and why

**Contains:**

- Objectives completed
- New file structure
- Improvement metrics
- Code organization examples (before/after)
- Parameter ranges and constraints
- Architecture patterns used
- Usage instructions
- Checklist of completed items

**Read time:** ~20 minutes

**Audience:** Backend developers, code reviewers

---

### 5. **ARCHITECTURE_DIAGRAMS.md** - Visual Diagrams

**Best for:** Visual learners who want to understand system flow

**Contains:**

- Complete system architecture diagram
- 12 parameters organized by groups
- Real-time data flow during monitoring
- Anomaly detection decision flow
- Critical combinations alert structure
- Before/after file organization

**Read time:** ~10 minutes (visual reference)

**Audience:** Visual learners, system architects

---

## 🎯 Reading Paths by Role

### For New Developers

1. **QUICK_REFERENCE.md** (5 min) - Get overview
2. **README.md** (15 min) - Understand architecture
3. **ARCHITECTURE_DIAGRAMS.md** (5 min) - Visual understanding
4. **Code review** - Read data_utils.py, analysis_utils.py

### For Domain Experts / Drilling Engineers

1. **PARAMETERS_INFO.md** - Understand all 12 parameters
2. **README.md** (Configuration section) - Optional
3. **PARAMETERS_INFO.md** (Anomaly detection logic) - Learn detection

### For DevOps / Operations

1. **README.md** (Running section) - Deployment
2. **README.md** (Configuration section) - Setup
3. **QUICK_REFERENCE.md** (Common tasks) - Troubleshooting

### For System Architects

1. **README.md** - Full architecture
2. **REFACTORING_SUMMARY.md** - Design decisions
3. **ARCHITECTURE_DIAGRAMS.md** - Visual overview
4. **Code review** - All Python files

### For Code Reviewers

1. **REFACTORING_SUMMARY.md** - What changed
2. **README.md** (Design patterns) - Architecture patterns
3. **Code review** - Compare before/after code

---

## 📊 Documentation Statistics

| File                     | Lines     | Focus                 | Audience               |
| ------------------------ | --------- | --------------------- | ---------------------- |
| README.md                | ~180      | Architecture & Setup  | Developers             |
| PARAMETERS_INFO.md       | ~300      | Domain Knowledge      | Engineers & Developers |
| QUICK_REFERENCE.md       | ~200      | Quick Guide           | All                    |
| REFACTORING_SUMMARY.md   | ~220      | Changes & Metrics     | Developers             |
| ARCHITECTURE_DIAGRAMS.md | ~250      | Visual Reference      | Visual Learners        |
| **Total**                | **~1150** | **Complete Coverage** | **Everyone**           |

---

## 🔍 Key Sections Quick Links

### Architecture & System Design

- [README.md - File Descriptions](README.md#file-descriptions)
- [README.md - Design Patterns](README.md#key-design-patterns)
- [ARCHITECTURE_DIAGRAMS.md - System Overview](ARCHITECTURE_DIAGRAMS.md#complete-system-architecture)

### Parameters

- [PARAMETERS_INFO.md - All 12 Parameters](PARAMETERS_INFO.md#параметры-буровых-данных-12-ключевых-параметров)
- [QUICK_REFERENCE.md - Parameter Table](QUICK_REFERENCE.md#🎯-12-key-drilling-parameters)
- [ARCHITECTURE_DIAGRAMS.md - Parameter Groups](ARCHITECTURE_DIAGRAMS.md#12-drilling-parameters)

### Analysis Methods

- [PARAMETERS_INFO.md - Analysis Methods](PARAMETERS_INFO.md#методы-анализа)
- [ARCHITECTURE_DIAGRAMS.md - Detection Flow](ARCHITECTURE_DIAGRAMS.md#decision-flow-for-anomaly-detection)

### Getting Started

- [README.md - Running Backend](README.md#running-the-backend)
- [QUICK_REFERENCE.md - Quick Start](QUICK_REFERENCE.md#🚀-quick-start)

### Extending/Modifying

- [QUICK_REFERENCE.md - Common Tasks](QUICK_REFERENCE.md#🔧-common-tasks)
- [README.md - Future Improvements](README.md#future-improvements)

### Critical Information

- [PARAMETERS_INFO.md - Critical Combinations](PARAMETERS_INFO.md#логика-обнаружения-аномалий)
- [ARCHITECTURE_DIAGRAMS.md - Critical Combinations Alert](ARCHITECTURE_DIAGRAMS.md#critical-combinations-alert)

---

## 📝 Code Files Reference

### main.py (159 lines)

**Location:** [backend/main.py](main.py)
**Purpose:** FastAPI application and routes
**Key Components:**

- `/api/v1/analyze/file` - File upload endpoint
- `/api/v1/ws` - WebSocket endpoint
- CORS middleware
- Application lifespan

### methods.py (70 lines)

**Location:** [backend/methods.py](methods.py)
**Purpose:** Anomaly detection algorithms
**Key Functions:**

- `fft()` - Frequency analysis
- `z_score()` - Statistical outlier detection
- `lof()` - Local outlier factor

### data_utils.py (107 lines)

**Location:** [backend/data_utils.py](data_utils.py)
**Purpose:** Data parsing and validation
**Key Functions:**

- `parse_data()` - Parse TSV file
- `filter_required_parameters()` - Extract 12 params
- `validate_parameter_value()` - Range check
- `get_parameter_inertia()` - Get inertia level
  **Key Constants:**
- `REQUIRED_PARAMETERS` - 12 parameters
- `PARAMETER_RANGES` - Valid ranges
- `PARAMETER_INERTIA` - Inertia levels

### analysis_utils.py (198 lines)

**Location:** [backend/analysis_utils.py](analysis_utils.py)
**Purpose:** Analysis state and WebSocket handling
**Key Classes:**

- `AnalysisState` - State management
  **Key Functions:**
- `handle_websocket_message()` - Parse WebSocket messages
- `apply_analysis_method()` - Run anomaly detection

---

## ✅ Pre-Flight Checklist

Before using WellPro backend:

- [ ] Read QUICK_REFERENCE.md (5 min)
- [ ] Understand 12 parameters from PARAMETERS_INFO.md
- [ ] Review architecture from README.md
- [ ] Check API endpoints in README.md
- [ ] Install dependencies from requirements.txt
- [ ] Start backend with uvicorn
- [ ] Test with frontend

---

## 🆘 Troubleshooting

**Can't find what I'm looking for?**

1. Check this index file
2. Use Ctrl+F to search within files
3. Look at table of contents in individual files
4. Review QUICK_REFERENCE.md for common questions

**Need specific information?**

- **"How do I run the backend?"** → README.md (Running section)
- **"What is parameter X?"** → PARAMETERS_INFO.md (Parameters section)
- **"How does analysis work?"** → ARCHITECTURE_DIAGRAMS.md (Detection flow)
- **"What changed in refactoring?"** → REFACTORING_SUMMARY.md
- **"How do I add a new parameter?"** → QUICK_REFERENCE.md (Common tasks)

---

## 📞 Documentation Maintenance

**Last Updated:** 2026-01-14
**Documentation Version:** 1.0
**Backend Version:** 1.0

### To Update Documentation

1. Update relevant .md file
2. Update this index if structure changes
3. Run spell check
4. Update version number above

---

## 📌 Summary

**Total Documentation:** 5 files, ~1150 lines
**Coverage:** Complete system documentation
**Formats:** Markdown with diagrams and code examples
**Audience:** Developers, engineers, operations staff

**Start with:** QUICK_REFERENCE.md
**Go deep with:** PARAMETERS_INFO.md
**Understand flow with:** ARCHITECTURE_DIAGRAMS.md

---

## 🎓 Learning Goals

After reading all documentation, you should understand:

- ✅ WellPro system architecture and components
- ✅ 12 drilling parameters and their behavior
- ✅ 3 anomaly detection algorithms
- ✅ Real-time WebSocket data flow
- ✅ API endpoints and usage
- ✅ How to extend and customize the system
- ✅ Critical combinations requiring immediate action
- ✅ Parameter relationships and dependencies

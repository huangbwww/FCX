from PyInstaller.utils.hooks import collect_dynamic_libs


# OR-Tools loads these DLLs from ``ortools/.libs`` at import time on Windows.
binaries = collect_dynamic_libs("ortools", destdir="ortools/.libs")

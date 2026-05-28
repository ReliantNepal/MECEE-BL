@echo off
REM Double-click this to launch the MECEE-BL Syllabus app.
REM It starts the local server on port 8000 and opens the app in your browser.
REM Optional argument: a page hash to deep-link into (e.g. "library", "routine").

cd /d "%~dp0"

REM Prefer the "py" launcher (installed with most Python distributions on Windows),
REM fall back to "python" on PATH.
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    py launcher.py %1
) else (
    python launcher.py %1
)

REM Keep the window open if the launcher exited with an error so you can read it.
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Launcher exited with code %ERRORLEVEL%.
    pause
)

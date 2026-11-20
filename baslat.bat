@echo off
cd /d "%~dp0"
where yt-dlp >nul 2>nul || (echo yt-dlp bulunamadi. Kurmak icin: winget install yt-dlp.yt-dlp & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo ffmpeg bulunamadi. Kurmak icin: winget install Gyan.FFmpeg & pause & exit /b 1)
start "" http://127.0.0.1:8765
node src\sunucu.js
pause

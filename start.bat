@echo off
cd /d %~dp0
start "" http://localhost:8767/
node serve.js 8767

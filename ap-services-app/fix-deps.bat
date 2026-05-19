@echo off
cd /d "%~dp0"
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f package-lock.json
if exist .expo rmdir /s /q .expo
call npm install
call npx expo install --fix
call npx expo install metro @expo/metro-config react-native-webview expo-linking expo
npx expo start -c

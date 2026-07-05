#!/bin/bash
cd "$(dirname "$0")"
LOGFILE="setup.log"
echo "=== npm install start: $(date) ===" > "$LOGFILE"
npm install >> "$LOGFILE" 2>&1
INSTALL_EXIT=$?
echo "=== npm install exit code: $INSTALL_EXIT ===" >> "$LOGFILE"
if [ $INSTALL_EXIT -eq 0 ]; then
  echo "=== npm run build start: $(date) ===" >> "$LOGFILE"
  npm run build >> "$LOGFILE" 2>&1
  BUILD_EXIT=$?
  echo "=== npm run build exit code: $BUILD_EXIT ===" >> "$LOGFILE"
fi
echo ""
echo "完成，日誌已寫入 setup.log。"
read -n 1 -s -r -p "按任意鍵關閉此視窗..."
echo ""

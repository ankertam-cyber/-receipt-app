#!/bin/bash
cd "$(dirname "$0")"
LOGFILE="auth-deploy.log"
echo "=== build start: $(date) ===" > "$LOGFILE"
npm run build >> "$LOGFILE" 2>&1
BUILD_EXIT=$?
echo "=== build exit code: $BUILD_EXIT ===" >> "$LOGFILE"
if [ $BUILD_EXIT -eq 0 ]; then
  echo "=== git start: $(date) ===" >> "$LOGFILE"
  git add -A >> "$LOGFILE" 2>&1
  git commit -m "Add simple password protection (Basic Auth middleware)" >> "$LOGFILE" 2>&1
  git push origin main >> "$LOGFILE" 2>&1
  echo "=== git push exit code: $? ===" >> "$LOGFILE"
fi
echo ""
echo "完成，請查看 auth-deploy.log"
read -n 1 -s -r -p "按任意鍵關閉此視窗..."
echo ""

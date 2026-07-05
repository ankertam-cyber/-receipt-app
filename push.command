#!/bin/bash
cd "$(dirname "$0")"
LOGFILE="push.log"
echo "=== git start: $(date) ===" > "$LOGFILE"
git init >> "$LOGFILE" 2>&1
git add -A >> "$LOGFILE" 2>&1
if ! git config user.email > /dev/null 2>&1; then
  git config user.email "receipt-app@example.com"
fi
if ! git config user.name > /dev/null 2>&1; then
  git config user.name "receipt-app-bot"
fi
git commit -m "Rebuild: Next.js 智能單據與報銷系統 (from scratch)" >> "$LOGFILE" 2>&1
git branch -M main >> "$LOGFILE" 2>&1
git remote remove origin >> "$LOGFILE" 2>&1
git remote add origin https://github.com/ankertam-cyber/-receipt-app.git >> "$LOGFILE" 2>&1
git push -f origin main >> "$LOGFILE" 2>&1
echo "=== git push exit code: $? ===" >> "$LOGFILE"
echo ""
echo "完成，請查看 push.log"
read -n 1 -s -r -p "按任意鍵關閉此視窗..."
echo ""

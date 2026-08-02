#!/usr/bin/env bash
# web-translate — Claude Code 스킬 설치 (git 불필요, 개인 스킬)
# 사용:  curl -fsSL https://raw.githubusercontent.com/taekimax/tk-b3rys-translate/main/install-skill.sh | bash
set -euo pipefail

SKILL_NAME="webtranslate"
DEST="$HOME/.claude/skills/$SKILL_NAME"
RAW="https://raw.githubusercontent.com/taekimax/tk-b3rys-translate/main/skills/$SKILL_NAME"

echo "web-translate 스킬 설치 중…"
mkdir -p "$DEST"
curl -fsSL "$RAW/SKILL.md" -o "$DEST/SKILL.md"

echo "✓ 설치 완료: $DEST/SKILL.md"
echo
echo "  Claude Code에서:"
echo "    /reload-skills     # 스킬 로드"
echo "    /webtranslate      # 실행 (또는 자연어 \"번역 확장 설치해줘\")"

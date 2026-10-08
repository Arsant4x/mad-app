set -o pipefail
drop="$1"
files=()
while IFS= read -r -d '' f; do
  [ -f "$f" ] || continue
  [ "$f" = "$drop" ] && continue
  first=''
  IFS= read -r first < "$f" 2>/dev/null || true
  case "$first" in
    '#!'*/sh|'#!'*/sh' '*|'#!'*/bash|'#!'*/bash' '*|'#!'*/dash|'#!'*'env sh'|'#!'*'env bash') files+=("$f") ;;
  esac
done < <(git ls-files -z)
[ "$2" = addjson ] && files+=(package.json)
has_file() { local x; for x in "${files[@]}"; do [ "$x" = "$1" ] && return 0; done; return 1; }
has_file '.githooks/pre-commit' || { echo "blind: pre-commit"; exit 1; }
has_file 'deploy.sh' || { echo "blind: deploy.sh"; exit 1; }
if has_file 'package.json'; then echo "wide: package.json"; exit 1; fi
echo "ok ${#files[@]}"

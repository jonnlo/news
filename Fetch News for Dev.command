#!/bin/zsh

cd -- "${0:A:h}" || exit 1

npm run collect:local
result=$?

if [[ -t 0 ]]; then
  echo
  read -r 'REPLY?Press Return to close this window…'
fi

exit "$result"

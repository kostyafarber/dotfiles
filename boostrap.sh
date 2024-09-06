#!/usr/bin/env bash

cat .bootstrap.ascii 

sleep 2

printf '\033[1J'

echo "boostrapping system..." 

echo "installing brew..."

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"


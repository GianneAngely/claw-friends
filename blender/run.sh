#!/bin/zsh
# Run a Blender python script headless with Angel's Steam copy of Blender.
# usage: run.sh <script.py> [args...]
B="$HOME/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender"
exec "$B" -b --factory-startup --python "$@"

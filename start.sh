#!/usr/bin/env bash
set -e

# 1. Start the Python Swarm backend in the background
echo "Booting Python Swarm backend..."
python ai_swarm.py &
PYTHON_PID=$!

# Wait a couple of seconds to ensure it starts
sleep 3

# 2. Start the Node.js server in the foreground
echo "Booting Node.js frontend..."
node server.js

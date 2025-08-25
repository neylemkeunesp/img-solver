#!/bin/bash

# Exit script on any error
set -e

# Function to clean up processes
cleanup() {
    echo "Stopping servers..."
    kill $(jobs -p) 2>/dev/null || true
    exit
}

# Set up signal handlers
trap cleanup INT TERM

# Start backend server
echo "Starting backend server on port 3001..."
node server.mjs &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Check if backend is still running
if kill -0 $BACKEND_PID 2>/dev/null; then
    echo "Backend server started successfully"
else
    echo "Failed to start backend server"
    exit 1
fi

# Start frontend server
echo "Starting frontend server..."
npm run dev

# Wait for both processes
wait $BACKEND_PID
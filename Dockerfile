FROM node:20-slim

# Install system dependencies (git, curl, build essentials, and python3)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Map python to python3
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Install uv (blazing fast Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Copy package files and install Node dependencies
COPY package.json package-lock.json ./
RUN npm install --production

# Create virtual environment and install Python dependencies
# We use uv to install the specific versions needed for Antigravity and your stack.
# Note: we are directly installing the necessary packages for ai_swarm.py
RUN uv venv /app/.venv
ENV VIRTUAL_ENV="/app/.venv"
ENV PATH="/app/.venv/bin:${PATH}"

RUN uv pip install fastapi uvicorn google-genai "google-antigravity[all]>=0.1.0" pydantic "protobuf==7.35.0" openai

# Copy the rest of the application code
COPY . .

# Make the start script executable
RUN chmod +x start.sh

# Expose the Node.js port (Render maps the PORT env var dynamically)
EXPOSE 3000

# Start both servers using the script
CMD ["./start.sh"]

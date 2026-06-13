FROM python:3.12-slim

WORKDIR /app

# Copy everything first (pyproject.toml references server/)
COPY . .

# Install dependencies
RUN pip install --no-cache-dir ".[x402]"

EXPOSE 8000

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]

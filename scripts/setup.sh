#!/bin/bash
# Agent Kickbacks — Setup Script

set -e

echo "🟦 Agent Kickbacks Setup"
echo "========================"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Install Python 3.10+"
    exit 1
fi

# Create venv
echo "📦 Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "📦 Installing dependencies..."
pip install -e ".[x402,dev]"

# Check .env
if [ ! -f .env ]; then
    echo "📝 Creating .env from template..."
    cp .env.example .env
    echo "⚠️  Edit .env with your values before running the server."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your DATABASE_URL (Railway Postgres) + wallet credentials"
echo "  2. Apply schema:  psql \"\$DATABASE_URL\" -f scripts/schema.sql"
echo "  3. Run: source venv/bin/activate"
echo "  4. Run: python -m server.main"
echo "  5. Test: curl http://localhost:8000/health"
echo ""
echo "  (Or just: docker compose up -d  — starts Postgres + server together)"

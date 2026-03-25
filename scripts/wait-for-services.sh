#!/usr/bin/env bash
set -euo pipefail

echo "Waiting for PostgreSQL..."
until docker compose exec -T postgres pg_isready -U cauldron > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready."

echo "Waiting for PostgreSQL (test)..."
until docker compose exec -T postgres-test pg_isready -U cauldron > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL (test) is ready."

echo "Waiting for Redis..."
until docker compose exec -T redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "Redis is ready."

echo "All services ready."

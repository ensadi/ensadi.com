# Root Makefile for ensadi.com

# Variables
PORT ?= 8000
HOST ?= localhost

.PHONY: help
help:
	@echo "ensadi.com Makefile Commands"
	@echo ""
	@echo "Available commands:"
	@echo "  start, run  Start a local development server from the repo root"
	@echo "  test        Run Playwright tests in Docker from the repo root"
	@echo "  help        Show this help message"

.PHONY: start run
start run:
	@echo "Starting ensadi.com on http://$(HOST):$(PORT)..."
	@echo "Press Ctrl+C to stop the server."
	@python3 -m http.server $(PORT)

.PHONY: clean
clean:
	@echo "Removing test artifacts and temporary files..."
	@rm -rf node_modules package-lock.json tests/results tests/test-results tests/playwright-test-logs

.PHONY: test
test: clean
	@echo "Running Playwright tests in Docker..."
	docker run --rm \
		-v $(PWD):/workspace \
		-w /workspace \
		-e CI=1 \
		mcr.microsoft.com/playwright:v1.61.1-jammy \
		bash -lc "npm install && npx playwright install && npx playwright test --config=tests/playwright.config.js"

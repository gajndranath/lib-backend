#!/bin/bash

# ============================================================================
# QUICK START LOAD TESTING
# ============================================================================

echo "🧪 LOAD TESTING QUICK START"
echo "======================================"
echo ""

# Check if server is running
echo "Checking if server is running..."
if ! curl -s http://localhost:8000/api/v1/health > /dev/null 2>&1; then
  echo "❌ Server is not running!"
  echo ""
  echo "Start server first:"
  echo "  cd backend && npm start"
  echo ""
  exit 1
fi

echo "✅ Server is running"
echo ""

# Check if Artillery is installed
echo "Checking Artillery installation..."
if ! command -v artillery &> /dev/null; then
  echo "❌ Artillery not found. Installing..."
  npm install -g artillery
fi

echo "✅ Artillery is ready"
echo ""

# Menu
echo "Choose load test option:"
echo ""
echo "1) Quick Test (50 users, 2 min)"
echo "2) Full Test (200 users, 10 min)"
echo "3) Advanced Test (200 users, detailed metrics)"
echo "4) Custom Test (manual configuration)"
echo "5) View Latest Report"
echo ""

read -p "Enter choice (1-5): " choice

case $choice in
  1)
    echo "Running quick test with 50 users..."
    npm run load-test:quick
    ;;
  2)
    echo "Running full load test with 200 users..."
    npm run load-test:report
    ;;
  3)
    echo "Running advanced load test..."
    npm run load-test:advanced
    ;;
  4)
    echo "Edit load-test.yml for custom configuration"
    echo "Then run: artillery run load-test.yml"
    ;;
  5)
    echo "Opening latest report..."
    # Find latest .json report
    LATEST=$(ls -t report-*.json 2>/dev/null | head -1)
    if [ -n "$LATEST" ]; then
      artillery report "$LATEST" --output view.html
      echo "Report generated: view.html"
    else
      echo "No reports found. Run a test first."
    fi
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "✅ Load test completed"
echo ""
echo "Documentation: cat LOAD_TESTING.md"

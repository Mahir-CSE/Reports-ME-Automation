# Price Movers – How to Run

## 1. Go to the project folder

```bash
cd "D:\Year 2026\Automation\Smartprep-&-Reporting\Reports-ME-Automation\Price-Movers"
```

## 2. First time only

```bash
npm install
npx playwright install chromium
```

Copy `.env.example` to `.env`, then fill in `BASE_URL`, `TEST_USERNAME` and `TEST_PASSWORD`.

## 3. Start the runner

```bash
npm run runner
```

The runner opens at **http://localhost:4321**. Enter your inputs there and click Run.

To stop the runner, press **Ctrl + C** in the terminal.

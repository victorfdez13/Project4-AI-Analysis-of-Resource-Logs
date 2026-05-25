import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import MainPage from './MainPage';

// ---------- helpers ----------

const ok = (body) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  });

const fail = (body, status = 503) =>
  Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });

const DATASETS = { datasets: ['DATASET1'] };

const LOG_ITEM = {
  logId: 1,
  level: 2,
  category: 'LoginSystem',
  message: 'User logged in',
  time: '2026-01-01T00:00:00',
};

const LOGS_PAGE = { items: [LOG_ITEM], totalCount: 1 };
const EMPTY_LOGS = { items: [], totalCount: 0 };

const LOG_DETAIL = {
  logId: 1,
  level: 2,
  category: 'LoginSystem',
  message: 'User logged in',
  dataset: 'DATASET1',
  entities: [],
  changes: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>
  );
}

// ---------- tests ----------

describe('MainPage empty-state and error messages', () => {
  // vi.stubGlobal requires vi.unstubAllGlobals, not vi.restoreAllMocks
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ------------------------------------------------------------------ //
  // Test 1 — No logs in dataset (no active filters)
  // ------------------------------------------------------------------ //
  it('shows "No logs found in this dataset" when the API returns an empty list with no filters', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.includes('/datasets')) return ok(DATASETS);
      return ok(EMPTY_LOGS);
    }));

    renderPage();

    const cell = await screen.findByTestId('empty-logs');
    expect(cell).toHaveTextContent('No logs found in this dataset');
  });

  // ------------------------------------------------------------------ //
  // Test 2 — No log selected
  // Use EMPTY_LOGS so the component never auto-selects a log
  // ------------------------------------------------------------------ //
  it('shows "Select a log above to view details" and disables the Analyze button when no log is selected', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.includes('/datasets')) return ok(DATASETS);
      return ok(EMPTY_LOGS);
    }));

    renderPage();

    // Wait until the empty-logs cell appears (confirms datasets + logs both loaded)
    await screen.findByTestId('empty-logs');

    // The Selected Log detail section shows the placeholder
    expect(screen.getByTestId('no-log-selected')).toHaveTextContent(
      'Select a log above to view details.'
    );

    // Analyze button must be disabled because nothing is selected
    expect(screen.getByTestId('analyze-button')).toBeDisabled();
  });

  // ------------------------------------------------------------------ //
  // Test 3 — AI analysis request fails
  // ------------------------------------------------------------------ //
  it('shows a red error banner when the AI analysis request fails and keeps Summary as "-"', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.includes('/datasets')) return ok(DATASETS);
      // POST to /analyze → service error
      if (options.method === 'POST') return fail({ message: 'Unable to analyze the selected log.' });
      // GET /api/logs/1?dataset=... → log detail
      if (/\/api\/logs\/\d+/.test(url)) return ok(LOG_DETAIL);
      // GET /api/logs?... → page of logs
      return ok(LOGS_PAGE);
    }));

    renderPage();

    // The component auto-selects the first log and fetches its detail.
    // Wait until the Analyze button becomes enabled (detail loaded → selectedLogId set).
    const analyzeBtn = screen.getByTestId('analyze-button');
    await waitFor(() => expect(analyzeBtn).not.toBeDisabled(), { timeout: 3000 });

    // Trigger analysis
    await userEvent.click(analyzeBtn);

    // Error banner must appear with the message from the API
    const errorBanner = await screen.findByTestId('analysis-error');
    expect(errorBanner).toBeInTheDocument();
    expect(errorBanner).toHaveTextContent('Unable to analyze');

    // Summary field must still show "-" — error is NOT mixed into the summary text
    expect(screen.getByTestId('analysis-summary')).toHaveTextContent('-');
  });
});

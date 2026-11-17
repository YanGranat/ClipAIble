# Tests

Install dependencies with `npm ci`.

```sh
npm test
npm run test:watch
npm run test:coverage
```

To run one test file:

```sh
npx vitest run tests/utils/html.test.js
```

Tests use Vitest and the Chrome API setup in `tests/setup.js`. Add tests beside the corresponding feature directory and import the production module being tested. Use synthetic inputs and isolate browser storage, timers, and external requests.

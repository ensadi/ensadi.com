# Police Sidekick Web Application

A Progressive Web App (PWA) version of the Police Sidekick application. This web version removes in-app purchases and instead offers all datasets as free downloads, storing them in browser storage for offline access.

## Features

- **Offline Access**: Download datasets and access them without internet
- **Search**: Search datasets
- **Progressive Web App**: Installable on mobile devices
- **Free Content**: All datasets are free to download
- **Browser Storage**: Uses LocalStorage and IndexedDB for data storage

## Project Structure

```
apps/policesidekick/
├── index.html                 # Main entry point
├── manifest.json              # PWA manifest for installability
├── serviceworker.js           # Service worker for offline support
├── app.js                     # Main application logic
├── package.json               # Node package manifest for tests
├── tests/                     # Playwright end-to-end tests and report output
│   ├── playwright.config.js
│   └── policesidekick.spec.js
├── styles/
│   └── style.css              # Main stylesheet
├── lib/
│   ├── download-manager.js    # Dataset download logic
│   ├── storage-manager.js     # Local storage management
│   └── ui-components.js       # Reusable UI components
├── assets/
│   ├── icon-192.png           # PWA icon asset
│   ├── icon-512.png           # PWA icon asset
├── docs/                     # Project documentation
│   ├── PoliceSidekick-iOS-Documentation.md
│   └── PoliceSidekick-Web-Application-Plan.md
└── README.md                  # This file
```

## Getting Started

### Prerequisites

- A modern web browser with support for:
  - Service Workers
  - IndexedDB
  - LocalStorage
  - ES6 Modules

### Installation

1. Clone or copy the files to your web server
2. Ensure the server serves files with correct MIME types
3. Access the application via HTTPS (required for Service Workers)

### Building

This project uses no build tools - it's pure HTML/CSS/JavaScript. Simply serve the files:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Usage

1. **Browse Datasets**: View available datasets from the main screen
2. **Search**: Use the search bar to find specific datasets
3. **Download**: Click download on free datasets to save them for offline use
4. **Access Offline**: Once downloaded, access datasets without internet

## Technical Details

### Storage Strategy

- **LocalStorage**: Small metadata (dataset info, catalog cache)
- **IndexedDB**: Large dataset files (HTML content)

### Download Flow

1. User selects dataset from catalog
2. Create temporary `zloading.{DatasetName}` directory in IndexedDB
3. Download `Description.plist` to verify dataset
4. Download each HTML file individually
5. Update progress UI after each file
6. On success: Rename to `{DatasetName}`, update metadata
7. On failure: Delete `zloading.` directory, show error

### Service Worker Strategy

- **Cache-first**: Dataset files
- **Network-first**: Catalog updates
- **Stale-while-revalidate**: Static assets

## API Endpoints

The application fetches data from:

- `/ensadi/PoliceSidekick/DataSets/DataSets.plist` - Main dataset catalog
- `/ensadi/PoliceSidekick/DataSets/{DatasetName}/Description.plist` - Dataset metadata
- `/ensadi/PoliceSidekick/DataSets/{DatasetName}/{FileName}` - Individual dataset files

## Browser Support

- **Chrome**: Full support (PWA installable)
- **Firefox**: Full support (PWA installable)
- **Safari**: Full support (PWA installable on iOS 11.3+)
- **Edge**: Full support (PWA installable)

## Development

### Testing

This project includes Playwright end-to-end tests under `tests/` at the repository root.

Run them from the repo root via Docker:

```bash
make test
```

The test run installs dependencies and generates an HTML report at:

- `tests/results/html-report/index.html`

You can also run tests locally with Node if you prefer:

```bash
npm install
npx playwright install
npx playwright test --config=tests/playwright.config.js
```

Test the application by:

1. Opening in a browser
2. Checking browser DevTools for errors
3. Testing offline mode via DevTools Network tab
4. Verifying PWA installation

### Debugging

- Check browser console for errors
- Verify Service Worker registration in DevTools
- Check IndexedDB storage in Application tab
- Monitor network requests

## License

This project is part of the ensadi.com ecosystem. See the main repository for license information.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions:

- Check the browser console for errors
- Verify browser support for required features
- Check network connectivity
- Clear browser storage if experiencing issues

## Version History

### 2.0.0

- Basic dataset browsing
- Download functionality
- Offline support
- Search functionality
- PWA installation support

### 1.0.0

- Original iOS and Android app features, including in-app purchases (not included in this web version)
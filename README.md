# Reddit LLM Comment Detector

A browser extension that uses machine learning to detect AI-generated comments on Reddit. Built with [🤗 Transformers.js](https://huggingface.co/docs/transformers.js) for client-side inference.

## 🎯 What It Does

This extension analyzes Reddit comments in real-time to identify content that may have been generated by Large Language Models (AI). It provides:

- **🚨 Visual highlighting** of potentially AI-generated comments
- **📊 User scoring system** that tracks AI detection percentages for individual users  
- **🎨 Color-coded risk levels** (green/orange/red based on AI percentage)
- **💾 Persistent tracking** across browsing sessions
- **⚡ Real-time analysis** as you browse Reddit
- **🎛️ Customizable aggression levels** from passive highlighting to auto-minimizing AI comments

## 🧠 How It Works

The extension uses specialized AI models trained to distinguish between human-written and AI-generated text:

- **slop-detector-mini-2** (Recommended): Balanced performance with fewer false negatives
- **slop-detector-mini**: Fast and compact but more false positives  
- **slop-detector**: Larger model, slower and less accurate

All processing happens locally in your browser - no data is sent to external servers.

## 🚀 Installation

### Chrome Web Store (Recommended)

**[📱 Install from Chrome Web Store](https://chromewebstore.google.com/detail/reddit-ai-comment-detecto/mkpjidfddjkkdpokcnhbjcjfadelpjee)**

The easiest way to install the extension is directly from the Chrome Web Store.

**Note: Firefox Add-ons store version coming soon!**

### Manual Installation

**Download pre-built extensions:**

1. **Go to the [Releases](https://github.com/trentmkelly/reddit-llm-comment-detector/releases) page**
2. **Download the latest zip file for your browser:**
   - `reddit-llm-comment-detector-chrome-v*.zip` for Chrome
   - `reddit-llm-comment-detector-firefox-v*.zip` for Firefox

#### Chrome Installation from Zip
1. Download the Chrome zip file and extract it to a folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extracted folder
6. The extension should now appear in your extensions list

#### Firefox Installation from Zip
1. Download the Firefox zip file and extract it to a folder
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Navigate to the extracted folder and select `manifest.json`
6. The extension will be loaded temporarily (until Firefox restart)

### Build from Source

If you prefer to build the extensions yourself:

#### Chrome Build from Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/trentmkelly/reddit-llm-comment-detector.git
   cd reddit-llm-comment-detector/Chrome
   ```

2. **Install dependencies and build**
   ```bash
   npm install
   npm run build
   ```

3. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `build` directory from the Chrome folder

#### Firefox Build from Source

1. **Navigate to Firefox folder**
   ```bash
   cd reddit-llm-comment-detector/Firefox
   ```

2. **Install dependencies and build**
   ```bash
   npm install
   npm run build
   ```

3. **Load in Firefox**
   - Open Firefox and go to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file from the `build` directory

## 📋 Features

### Comment Detection
- **Automatic scanning** of Reddit comments as you browse
- **Smart detection** using state-of-the-art NLP models
- **Confidence scoring** to reduce false positives

### User Tracking
- **Persistent scoring** system that remembers users across sessions
- **AI percentage tracking** showing what % of a user's comments were flagged as AI
- **Comment history** with confidence scores and timestamps

### Visual Indicators
- **Highlighted comments** with orange warning badges for AI-detected content
- **User badges** showing AI percentage next to usernames
- **Color coding**: Green (< 20% AI), Orange (20-40% AI), Red (> 40% AI)

### Customization Options
- **Progress widgets** to show analysis status
- **Aggression levels**: Low (highlight only) or High (auto-minimize AI comments)
- **Display toggles** for various visual elements
- **Model selection** between different detection models

## 🎛️ Settings

Access the extension popup to configure:

- **AI Model Selection**: Choose between different detection models
- **Display Options**: Toggle progress widgets, user scores, highlighting
- **Aggression Level**: 
  - Low: Just highlight and track
  - High: Auto-minimize suspected AI comments
- **Auto-analyze**: Automatically scan new comments as they load

## 🔧 Development

### Project Structure

```
Chrome/                    # Chrome extension version
├── src/
│   ├── content.js        # Main detection logic, runs on Reddit pages
│   ├── background.js     # Service worker, handles AI model loading
│   ├── popup.html        # Extension popup interface
│   ├── popup.js         # Popup logic and settings
│   └── popup.css        # Popup styling
├── build/               # Built extension files
├── package.json
└── webpack.config.js

Firefox/                 # Firefox extension version (similar structure)
```

### Key Components

- **Content Script** (`content.js`): Scans Reddit pages, extracts comments, manages UI updates
- **Background Script** (`background.js`): Loads and runs the AI models using Transformers.js
- **Popup Interface**: Settings and controls, includes live demo functionality

### Building from Source

1. Install Node.js dependencies: `npm install`
2. Build for production: `npm run build`
3. For development with auto-rebuild: `npm run dev`

## 🎯 Accuracy & Performance

The extension uses models specifically trained on Reddit-style text to distinguish between human and AI-generated content. While no detection system is 100% accurate, these models have been optimized to minimize false positives while catching likely AI-generated text.

**Performance characteristics:**
- Processing happens locally (no data sent to servers)
- Models are cached after first load
- Minimal impact on browsing performance
- Works on both old and new Reddit interfaces

## 🛡️ Privacy

- **No data collection**: All processing happens locally in your browser
- **No external API calls**: Models run entirely client-side
- **Local storage only**: User scores and settings stored locally
- **No tracking**: Extension doesn't report back any usage data

## 🤝 Contributing

This project is open source! Feel free to:
- Report issues or bugs
- Suggest new features  
- Submit pull requests
- Help improve the detection models

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Built with [🤗 Transformers.js](https://huggingface.co/docs/transformers.js)
- Extension code loosely based on [Transformers.js browser extension example](https://github.com/huggingface/transformers.js/tree/main/examples/extension)
- Detection models trained on curated datasets
- Inspired by the need for transparency in AI-generated content

---

**⚠️ Disclaimer**: This tool provides estimates based on text patterns and should not be considered definitive proof that content is AI-generated. Use responsibly and consider the possibility of false positives.
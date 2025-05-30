// popup.js - Settings and controls for the Reddit AI Comment Detector extension

// Configuration storage key
const SETTINGS_KEY = 'reddit-ai-detector-settings';

// Default settings
const DEFAULT_SETTINGS = {
    showProgress: true,
    showUserScores: true,
    highlightComments: true,
    showHumanIndicators: false,
    autoAnalyze: true,
    aggressionLevel: 'low',
    selectedModel: 'trentmkelly/slop-detector-mini-2'
};

// Load settings from storage
function loadSettings() {
    try {
        return new Promise((resolve) => {
            chrome.storage.local.get([SETTINGS_KEY], (result) => {
                const stored = result[SETTINGS_KEY];
                const finalSettings = stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
                console.log('Popup settings loaded:', finalSettings);
                resolve(finalSettings);
            });
        });
    } catch (error) {
        console.error('Failed to load settings:', error);
        return Promise.resolve(DEFAULT_SETTINGS);
    }
}

// Save settings to storage
function saveSettings(settings) {
    try {
        chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
            console.log('Settings saved:', settings);
        });
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

// Demo functionality
let demoTimeout = null;

function classifyDemoText(text) {
    const resultDiv = document.getElementById('demoResult');
    
    if (!text || text.trim().length < 10) {
        resultDiv.textContent = text.trim().length === 0 ? '' : 'Enter at least 10 characters for analysis...';
        resultDiv.className = 'demo-result';
        return;
    }
    
    resultDiv.textContent = 'Analyzing...';
    resultDiv.className = 'demo-result loading';
    
    const message = {
        action: 'classify',
        text: text.trim()
    };
    
    chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
            resultDiv.textContent = 'Error: Could not analyze text. Make sure you\'re on a Reddit page first.';
            resultDiv.className = 'demo-result';
            return;
        }
        
        if (!response || response.error) {
            resultDiv.textContent = 'Error: ' + (response?.error || 'Classification failed');
            resultDiv.className = 'demo-result';
            return;
        }
        
        // Handle classification result
        const topPrediction = Array.isArray(response) ? response[0] : response;
        
        if (topPrediction && topPrediction.label === 'llm' && topPrediction.score > 0.5) {
            // Clear previous content
            resultDiv.innerHTML = '';
            
            // Create elements safely
            const icon = document.createTextNode('🤖 ');
            const title = document.createElement('strong');
            title.textContent = 'AI Detected';
            const br1 = document.createElement('br');
            const confidence = document.createTextNode(`Confidence: ${(topPrediction.score * 100).toFixed(1)}%`);
            const br2 = document.createElement('br');
            const description = document.createTextNode('This text appears to be AI-generated.');
            
            // Append elements
            resultDiv.appendChild(icon);
            resultDiv.appendChild(title);
            resultDiv.appendChild(br1);
            resultDiv.appendChild(confidence);
            resultDiv.appendChild(br2);
            resultDiv.appendChild(description);
            
            resultDiv.className = 'demo-result ai-detected';
        } else {
            // For human detection, use the score directly if label is 'human', otherwise invert the llm score
            let confidence;
            if (topPrediction?.label === 'human') {
                confidence = (topPrediction.score * 100).toFixed(1);
            } else if (topPrediction?.label === 'llm') {
                confidence = ((1 - topPrediction.score) * 100).toFixed(1);
            } else {
                confidence = '50.0';
            }
            // Clear previous content
            resultDiv.innerHTML = '';
            
            // Create elements safely
            const icon = document.createTextNode('✅ ');
            const title = document.createElement('strong');
            title.textContent = 'Human Detected';
            const br1 = document.createElement('br');
            const confidenceText = document.createTextNode(`Confidence: ${confidence}%`);
            const br2 = document.createElement('br');
            const description = document.createTextNode('This text appears to be human-written.');
            
            // Append elements
            resultDiv.appendChild(icon);
            resultDiv.appendChild(title);
            resultDiv.appendChild(br1);
            resultDiv.appendChild(confidenceText);
            resultDiv.appendChild(br2);
            resultDiv.appendChild(description);
            
            resultDiv.className = 'demo-result human-detected';
        }
    });
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    const settings = await loadSettings();
    
    // Set checkbox states from saved settings
    document.getElementById('showProgress').checked = settings.showProgress;
    document.getElementById('showUserScores').checked = settings.showUserScores;
    document.getElementById('highlightComments').checked = settings.highlightComments;
    document.getElementById('showHumanIndicators').checked = settings.showHumanIndicators;
    document.getElementById('autoAnalyze').checked = settings.autoAnalyze;
    
    // Set aggression level radio button
    const aggressionRadio = document.querySelector(`input[name="aggression"][value="${settings.aggressionLevel}"]`);
    if (aggressionRadio) {
        aggressionRadio.checked = true;
    }
    
    // Set selected model
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
        modelSelect.value = settings.selectedModel;
    }
    
    // Add event listeners for all checkboxes
    const checkboxes = ['showProgress', 'showUserScores', 'highlightComments', 'showHumanIndicators', 'autoAnalyze'];
    
    checkboxes.forEach(id => {
        document.getElementById(id).addEventListener('change', async (event) => {
            const currentSettings = await loadSettings();
            currentSettings[id] = event.target.checked;
            saveSettings(currentSettings);
            
            // Notify content script of settings change
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'settingsChanged',
                        settings: currentSettings
                    }).catch(() => {
                        // Ignore errors if content script isn't loaded
                    });
                }
            });
        });
    });
    
    // Add event listeners for aggression level radio buttons
    const aggressionRadios = document.querySelectorAll('input[name="aggression"]');
    aggressionRadios.forEach(radio => {
        radio.addEventListener('change', async (event) => {
            if (event.target.checked) {
                const currentSettings = await loadSettings();
                currentSettings.aggressionLevel = event.target.value;
                saveSettings(currentSettings);
                
                // Notify content script of settings change
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'settingsChanged',
                            settings: currentSettings
                        }).catch(() => {
                            // Ignore errors if content script isn't loaded
                        });
                    }
                });
            }
        });
    });
    
    // Add event listener for model selection
    if (modelSelect) {
        modelSelect.addEventListener('change', async (event) => {
            const currentSettings = await loadSettings();
            currentSettings.selectedModel = event.target.value;
            saveSettings(currentSettings);
            
            // Notify background script that model changed (it needs to reload)
            chrome.runtime.sendMessage({
                action: 'modelChanged',
                model: event.target.value
            }).catch(() => {
                // Ignore errors if background script isn't ready
            });

            // Clear stored scores and notify content script
            chrome.storage.local.remove('reddit-user-scores');
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'clearData'
                    }).catch(() => {
                        // Ignore errors if content script isn't loaded
                    });
                }
            });
            
            // Notify content script of settings change
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'settingsChanged',
                        settings: currentSettings
                    }).catch(() => {
                        // Ignore errors if content script isn't loaded
                    });
                }
            });
        });
    }
    
    // Export User Data button
    document.getElementById('exportUserData').addEventListener('click', async () => {
        chrome.storage.local.get(['reddit-user-scores'], async (result) => {
            const userData = result['reddit-user-scores'] || {};
            const settings = await loadSettings();
            const selectedModel = settings.selectedModel;

            const csvRows = [['Username', 'PostsScanned', 'AIPosts', 'HumanPosts', 'ModelUsed']];

            for (const username in userData) {
                if (Object.prototype.hasOwnProperty.call(userData, username)) {
                    const userRecord = userData[username];
                    const comments = userRecord.comments || {};
                    const postsScanned = Object.keys(comments).length;
                    let aiPosts = 0;
                    for (const commentId in comments) {
                        if (Object.prototype.hasOwnProperty.call(comments, commentId)) {
                            if (comments[commentId].isAI === true) {
                                aiPosts++;
                            }
                        }
                    }
                    const humanPosts = postsScanned - aiPosts;
                    csvRows.push([username, postsScanned, aiPosts, humanPosts, selectedModel]);
                }
            }

            const csvString = csvRows.map(row => row.join(',')).join('\n');
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'reddit_user_data_export.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        });
    });

    // Clear data button
    document.getElementById('clearData').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all stored user data and scores?')) {
            chrome.storage.local.remove('reddit-user-scores');
            
            // Notify content script to refresh displays
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'clearData'
                    }).catch(() => {
                        // Ignore errors if content script isn't loaded
                    });
                }
            });
            
            alert('All user data has been cleared!');
        }
    });
    
    // Analyze now button
    document.getElementById('analyzeNow').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'analyzeNow'
                }).catch(() => {
                    alert('Please make sure you are on a Reddit page to analyze comments.');
                });
            }
        });
        
        // Close popup after triggering analysis
        window.close();
    });
    
    // Demo text input with debouncing
    const demoTextInput = document.getElementById('demoText');
    demoTextInput.addEventListener('input', (event) => {
        const text = event.target.value;
        
        // Clear previous timeout
        if (demoTimeout) {
            clearTimeout(demoTimeout);
        }
        
        // Debounce input to avoid too many API calls
        demoTimeout = setTimeout(() => {
            classifyDemoText(text);
        }, 800); // Wait 800ms after user stops typing
    });
    
    // Also trigger on Enter key
    demoTextInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (demoTimeout) {
                clearTimeout(demoTimeout);
            }
            classifyDemoText(event.target.value);
        }
    });
});

// Export settings functions for potential use by other scripts
window.getSettings = loadSettings;
window.saveSettings = saveSettings;
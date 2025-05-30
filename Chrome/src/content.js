// content.js - Reddit comment classifier
// Detects and classifies Reddit comments, highlighting those identified as LLM-generated

// Settings management
const SETTINGS_KEY = 'reddit-ai-detector-settings';
const DEFAULT_SETTINGS = {
    showProgress: true,
    showUserScores: true,
    highlightComments: true,
    showHumanIndicators: false,
    autoAnalyze: true,
    aggressionLevel: 'low'
};

let currentSettings = DEFAULT_SETTINGS;

// Load settings from storage
function loadSettings() {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get([SETTINGS_KEY], (result) => {
                const stored = result[SETTINGS_KEY];
                console.log('🔧 SETTINGS DEBUG: Raw stored settings:', stored);
                const finalSettings = stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
                console.log('🔧 SETTINGS DEBUG: Final merged settings:', finalSettings);
                resolve(finalSettings);
            });
        } catch (error) {
            console.error('Failed to load settings:', error);
            resolve(DEFAULT_SETTINGS);
        }
    });
}

// Initialize settings asynchronously
loadSettings().then(settings => {
    currentSettings = settings;
    console.log('🔧 SETTINGS DEBUG: Initial settings loaded:', currentSettings);
    console.log('🔧 SETTINGS DEBUG: Initial aggression level:', currentSettings.aggressionLevel);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'settingsChanged') {
        console.log('🔧 SETTINGS DEBUG: Received settings change message:', message.settings);
        console.log('🔧 SETTINGS DEBUG: Old settings:', currentSettings);
        currentSettings = message.settings;
        console.log('🔧 SETTINGS DEBUG: New settings applied:', currentSettings);
        console.log('🔧 SETTINGS DEBUG: Aggression level is now:', currentSettings.aggressionLevel);
        
        // Update displays based on new settings
        if (currentSettings.showUserScores) {
            userScoreManager.updateAllUserDisplays();
        } else {
            // Remove all user score badges
            document.querySelectorAll('.user-score-badge').forEach(badge => badge.remove());
        }
        
        sendResponse({ success: true });
    } else if (message.action === 'clearData') {
        // Clear processed comments and reload user data
        processedComments.clear();
        userScoreManager.loadUserData();
        userScoreManager.updateAllUserDisplays();
        
        // Remove all highlights and indicators
        document.querySelectorAll('[data-llm-highlighted]').forEach(el => {
            el.style.cssText = '';
            el.removeAttribute('data-llm-highlighted');
        });
        document.querySelectorAll('.llm-warning-badge').forEach(badge => badge.remove());
        document.querySelectorAll('.human-indicator').forEach(indicator => indicator.remove());
        
        sendResponse({ success: true });
    } else if (message.action === 'analyzeNow') {
        processAllComments();
        sendResponse({ success: true });
    }
});

// CSS selectors for different Reddit variants
const REDDIT_SELECTORS = {
    // Old Reddit
    oldReddit: {
        comments: '.comment .usertext-body .md',
        commentContainer: '.comment'
    },
    // New Reddit
    newReddit: {
        comments: 'shreddit-profile-comment .md p, shreddit-comment .md p, [data-testid="comment"] p, div[id*="post-rtjson-content"] p, .RichTextJSON-root p, .Comment p',
        commentContainer: 'shreddit-profile-comment, shreddit-comment, [data-testid="comment"]'
    },
    // General selectors that might work across variants
    general: {
        comments: '.usertext-body p, [role="article"] p, .Comment p, .commentarea p, shreddit-profile-comment .md p, shreddit-comment .md p, div[id*="post-rtjson-content"] p',
        commentContainer: '.comment, [data-testid="comment"], [role="article"], shreddit-profile-comment, shreddit-comment'
    }
};

// Track processed comments to avoid duplicate processing
const processedComments = new Set();

// User scoring system
class UserScoreManager {
    constructor() {
        this.storageKey = 'reddit-user-scores';
        this.loadUserData();
    }
    
    loadUserData() {
        chrome.storage.local.get([this.storageKey], (result) => {
            try {
                this.userData = result[this.storageKey] || {};
                console.log('User data loaded:', Object.keys(this.userData).length, 'users');
            } catch (error) {
                console.error('Failed to load user data:', error);
                this.userData = {};
            }
        });
    }
    
    saveUserData() {
        try {
            chrome.storage.local.set({ [this.storageKey]: this.userData }, () => {
                console.log('User data saved');
            });
        } catch (error) {
            console.error('Failed to save user data:', error);
        }
    }
    
    updateUserScore(username, commentId, isAI, confidence) {
        if (!username || !commentId) return;
        
        // Initialize user data if not exists
        if (!this.userData[username]) {
            this.userData[username] = {
                score: 0,
                comments: {}
            };
        }
        
        // Check if we've already scored this comment
        if (this.userData[username].comments[commentId]) {
            console.log(`Already scored comment ${commentId} for user ${username}`);
            return false; // Return false to indicate no new processing
        }
        
        // Calculate score delta - simplified scoring
        let scoreDelta;
        if (isAI) {
            // AI comments get -1 point
            scoreDelta = -1;
        } else {
            // Human comments get +1 point
            scoreDelta = 1;
        }
        
        // Update user score and record comment
        this.userData[username].score += scoreDelta;
        this.userData[username].comments[commentId] = {
            isAI,
            confidence,
            scoreDelta,
            timestamp: Date.now()
        };
        
        this.saveUserData();
        this.updateUserDisplay(username);
        
        console.log(`Updated score for ${username}: ${this.userData[username].score} (${scoreDelta > 0 ? '+' : ''}${scoreDelta})`);
        return true; // Return true to indicate new processing
    }
    
    // Check if a comment has already been processed
    isCommentProcessed(username, commentId) {
        if (!username || !commentId) return false;
        return this.userData[username]?.comments[commentId] !== undefined;
    }
    
    // Get cached comment result
    getCachedCommentResult(username, commentId) {
        if (!username || !commentId) return null;
        return this.userData[username]?.comments[commentId];
    }
    
    getUserScore(username) {
        return this.userData[username]?.score || 0;
    }
    
    updateUserDisplay(username) {
        // Find all instances of this username and update their displays
        const userElements = document.querySelectorAll(`a[href*="/user/${username}"], a[href*="/u/${username}"]`);
        userElements.forEach(element => this.addScoreToElement(element, username));
        
        // Also look for author elements without links (old Reddit)
        const authorElements = document.querySelectorAll('.author');
        authorElements.forEach(element => {
            if (element.textContent?.trim() === username) {
                this.addScoreToElement(element, username);
            }
        });
    }
    
    addScoreToElement(element, username) {
        // Check if user scores should be displayed
        if (!currentSettings.showUserScores) {
            return;
        }
        
        // Avoid adding multiple score badges
        if (element.querySelector('.user-score-badge')) {
            return;
        }
        
        const userData = this.userData[username];
        if (!userData || !userData.comments) return;
        
        const comments = Object.values(userData.comments);
        const totalComments = comments.length;
        const aiComments = comments.filter(comment => comment.isAI).length;
        
        if (totalComments === 0) return; // Don't show if no comments analyzed
        
        const aiPercentage = Math.round((aiComments / totalComments) * 100);
        
        // Color coding based on AI percentage
        let backgroundColor, textColor;
        if (aiPercentage < 20) {
            backgroundColor = 'rgba(76, 175, 80, 0.8)'; // Green
            textColor = 'white';
        } else if (aiPercentage <= 40) {
            backgroundColor = 'rgba(255, 152, 0, 0.8)'; // Orange/Yellow
            textColor = 'white';
        } else {
            backgroundColor = 'rgba(244, 67, 54, 0.8)'; // Red
            textColor = 'white';
        }
        
        const badge = document.createElement('span');
        badge.className = 'user-score-badge';
        badge.style.cssText = `
            margin-left: 4px;
            padding: 1px 4px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 500;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            white-space: nowrap;
            opacity: 0.7;
            background: ${backgroundColor};
            color: ${textColor};
        `;
        
        badge.textContent = `AI: ${aiPercentage}% (${aiComments}/${totalComments})`;
        
        let riskLevel;
        if (aiPercentage < 20) {
            riskLevel = 'Low Risk';
        } else if (aiPercentage <= 40) {
            riskLevel = 'Medium Risk';
        } else {
            riskLevel = 'High Risk';
        }
        
        badge.title = `AI Detection: ${riskLevel} - ${aiPercentage}% of comments flagged as AI (${aiComments}/${totalComments} comments)`;
        
        element.appendChild(badge);
    }
    
    // Update all visible usernames with scores
    updateAllUserDisplays() {
        // Find all username links
        const userLinks = document.querySelectorAll('a[href*="/user/"], a[href*="/u/"]');
        userLinks.forEach(link => {
            const href = link.getAttribute('href');
            const username = href.match(/\/u(?:ser)?\/([^\/\?\#]+)/)?.[1];
            if (username && this.userData[username]) {
                this.addScoreToElement(link, username);
            }
        });
        
        // Find all author elements (old Reddit)
        const authorElements = document.querySelectorAll('.author');
        authorElements.forEach(element => {
            const username = element.textContent?.trim();
            if (username && this.userData[username] && username !== '[deleted]') {
                this.addScoreToElement(element, username);
            }
        });
        
        // Find elements with author-name attribute (new Reddit)
        const authorNameElements = document.querySelectorAll('[author-name]');
        authorNameElements.forEach(element => {
            const username = element.getAttribute('author-name');
            if (username && this.userData[username] && username !== '[deleted]') {
                this.addScoreToElement(element, username);
            }
        });
    }
}

// Initialize user score manager
const userScoreManager = new UserScoreManager();

// Progress tracking
let progressWidget = null;
let totalComments = 0;
let processedCount = 0;

// Create floating progress widget
function createProgressWidget() {
    // Check if progress widget should be displayed
    if (!currentSettings.showProgress) {
        return null;
    }
    const widget = document.createElement('div');
    widget.id = 'llm-detector-progress';
    widget.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 300px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        padding: 16px;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 10000;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: all 0.3s ease;
        animation: slideIn 0.3s ease-out;
    `;
    
    widget.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 16px; height: 16px; background: #ff9800; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px;">🤖</div>
                <span style="font-weight: 600; font-size: 13px;">AI Comment Detector</span>
            </div>
            <button id="close-progress" style="background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 18px; line-height: 1; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s;">×</button>
        </div>
        <div style="margin-bottom: 8px;">
            <div id="progress-text" style="font-size: 12px; color: rgba(255,255,255,0.9); margin-bottom: 6px;">Scanning comments...</div>
            <div style="background: rgba(255,255,255,0.2); border-radius: 8px; height: 6px; overflow: hidden;">
                <div id="progress-bar" style="background: linear-gradient(90deg, #00f2fe 0%, #4facfe 100%); height: 100%; width: 0%; transition: width 0.3s ease; border-radius: 8px;"></div>
            </div>
        </div>
        <div id="status-text" style="font-size: 11px; color: rgba(255,255,255,0.7);">Initializing...</div>
    `;
    
    // Add slide-in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        #llm-detector-progress:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
        }
        #close-progress:hover {
            background: rgba(255,255,255,0.2) !important;
            color: white !important;
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(widget);
    
    // Add close functionality
    document.getElementById('close-progress').addEventListener('click', () => {
        widget.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => widget.remove(), 300);
    });
    
    // Add slide-out animation
    style.textContent += `
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    
    return widget;
}

// Update progress widget
function updateProgress(processed, total, status = '') {
    // Check if progress should be shown
    if (!currentSettings.showProgress) {
        return;
    }
    
    // Check if widget still exists and recreate if needed
    if (!progressWidget || !document.body.contains(progressWidget)) {
        if (progressWidget) {
            progressWidget.remove();
        }
        progressWidget = createProgressWidget();
    }
    
    // If progressWidget is null (settings disabled), return early
    if (!progressWidget) {
        return;
    }
    
    const progressBar = progressWidget.querySelector('#progress-bar');
    const progressText = progressWidget.querySelector('#progress-text');
    const statusText = progressWidget.querySelector('#status-text');
    
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
    
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
    
    if (progressText) {
        progressText.textContent = `Analyzing comments: ${processed}/${total} (${percentage}%)`;
    }
    
    if (statusText) {
        statusText.textContent = status || `${processed} comments processed`;
    }
    
    // Auto-hide when complete
    if (processed >= total && total > 0) {
        setTimeout(() => {
            if (progressWidget && progressWidget.parentNode) {
                progressWidget.style.animation = 'slideOut 0.3s ease-in forwards';
                setTimeout(() => {
                    if (progressWidget && progressWidget.parentNode) {
                        progressWidget.remove();
                        progressWidget = null;
                    }
                }, 300);
            }
        }, 2000);
    }
}

// Function to detect Reddit variant
function detectRedditVariant() {
    const hostname = window.location.hostname;
    if (hostname.includes('old.reddit')) return 'oldReddit';
    if (hostname.includes('sh.reddit')) return 'newReddit'; // sh.reddit uses new reddit UI
    if (hostname.includes('reddit.com')) return 'newReddit';
    return 'general';
}

// Function to get comment text content
function getCommentText(element) {
    // Remove any nested quotes or other comments to get just the main comment text
    const clone = element.cloneNode(true);
    
    // Remove quoted text and other nested elements that aren't part of the main comment
    const quotes = clone.querySelectorAll('blockquote, .md-spoiler-text');
    quotes.forEach(quote => quote.remove());
    
    return clone.textContent?.trim() || '';
}

// Function to check if model is ready
async function ensureModelReady() {
    return new Promise((resolve) => {
        // Send a test message to ensure the model is loaded
        const testMessage = {
            action: 'classify',
            text: 'Test message to initialize model'
        };
        
        console.log('Checking if model is ready...');
        
        chrome.runtime.sendMessage(testMessage, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Model ready check failed:', chrome.runtime.lastError);
                resolve(false);
            } else if (response && response.error) {
                console.error('Model ready check error:', response.error);
                resolve(false);
            } else {
                console.log('Model is ready for classification');
                resolve(true);
            }
        });
    });
}

// Function to classify a comment
async function classifyComment(text, retryCount = 0) {
    if (!text || text.length < 10) return null; // Skip very short comments
    
    try {
        const message = {
            action: 'classify',
            text: text
        };
        
        console.log('Sending message to background script:', message);
        
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                console.log('Received response from background script:', response);
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    resolve(null);
                } else if (response && response.error) {
                    console.error('Background script error:', response.error);
                    
                    // Retry session errors once after a delay
                    if ((response.error.includes('Session') || response.error.includes('session')) && retryCount < 1) {
                        console.log('Retrying after session error...');
                        setTimeout(() => {
                            classifyComment(text, retryCount + 1).then(resolve);
                        }, 3000);
                        return;
                    }
                    
                    resolve(null);
                } else {
                    resolve(response);
                }
            });
        });
    } catch (error) {
        console.error('Error classifying comment:', error);
        return null;
    }
}

// Function to highlight LLM-detected comment
function highlightLLMComment(commentElement) {
    // Check if comment highlighting should be shown
    if (!currentSettings.highlightComments) {
        return;
    }
    
    // Avoid highlighting the same element multiple times
    if (commentElement.dataset.llmHighlighted) {
        return;
    }
    commentElement.dataset.llmHighlighted = 'true';
    
    // Find the closest container (comment container)
    const container = commentElement.closest('shreddit-profile-comment, shreddit-comment, [data-testid="comment"], .comment') || commentElement.parentElement;
    
    if (!container) return;
    
    // Add non-destructive styling to the container
    container.style.cssText += `
        position: relative;
        background: linear-gradient(45deg, rgba(255, 193, 7, 0.05), rgba(255, 152, 0, 0.05)) !important;
        border-left: 4px solid #ff9800 !important;
        border-radius: 8px !important;
        box-shadow: 0 2px 8px rgba(255, 152, 0, 0.2) !important;
        margin: 8px 0 !important;
    `;
    
    // Create warning badge as floating overlay (non-destructive)
    const warning = document.createElement('div');
    warning.className = 'llm-warning-badge';
    warning.style.cssText = `
        position: absolute;
        bottom: -12px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #ff9800, #ff6f00);
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 2px 6px rgba(255, 152, 0, 0.4);
        border: 2px solid white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        pointer-events: none;
        white-space: nowrap;
    `;
    warning.innerHTML = `⚠️ May be AI-generated`;
    
    // Insert the badge without moving existing elements or affecting layout
    container.style.position = 'relative';
    container.appendChild(warning);
}

// Function to mark human-written comment with small indicator
function markHumanComment(commentElement) {
    // Check if human indicators should be shown
    if (!currentSettings.showHumanIndicators) {
        return;
    }
    
    // Avoid marking the same element multiple times
    if (commentElement.dataset.humanMarked) {
        return;
    }
    commentElement.dataset.humanMarked = 'true';
    
    // Find the closest container (comment container)
    const container = commentElement.closest('shreddit-profile-comment, shreddit-comment, [data-testid="comment"], .comment') || commentElement.parentElement;
    
    if (!container) return;
    
    // Create small progress indicator as floating overlay (non-destructive)
    const indicator = document.createElement('div');
    indicator.className = 'human-indicator';
    indicator.style.cssText = `
        position: absolute;
        bottom: -8px;
        right: 8px;
        background: rgba(76, 175, 80, 0.8);
        color: white;
        padding: 2px 6px;
        border-radius: 8px;
        font-size: 9px;
        font-weight: 500;
        z-index: 9999;
        box-shadow: 0 1px 3px rgba(76, 175, 80, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        pointer-events: none;
        opacity: 0.6;
        white-space: nowrap;
    `;
    indicator.innerHTML = `✓ Human`;
    
    // Insert the indicator without moving existing elements or affecting layout
    container.style.position = 'relative';
    container.appendChild(indicator);
}

// Function to minimize/collapse a comment (for High aggression)
function minimizeComment(commentElement) {
    console.log('🔍 MINIMIZE DEBUG: Starting minimizeComment function');
    console.log('🔍 MINIMIZE DEBUG: Comment element:', commentElement);
    
    const container = commentElement.closest('shreddit-profile-comment, shreddit-comment, [data-testid="comment"], .comment');
    console.log('🔍 MINIMIZE DEBUG: Found container:', container);
    
    if (!container) {
        console.log('🔍 MINIMIZE DEBUG: No container found, returning false');
        return false;
    }
    
    try {
        // Old Reddit - look for collapse/expand button
        console.log('🔍 MINIMIZE DEBUG: Looking for old Reddit expand button...');
        const expandButton = container.querySelector('.expand[onclick*="togglecomment"]');
        console.log('🔍 MINIMIZE DEBUG: Old Reddit expand button found:', expandButton);
        
        if (expandButton) {
            console.log('🔍 MINIMIZE DEBUG: Clicking old Reddit expand button');
            expandButton.click();
            console.log('✅ MINIMIZE SUCCESS: Minimized comment using old Reddit expand button');
            return true;
        }
        
        // Try alternative old Reddit selectors
        console.log('🔍 MINIMIZE DEBUG: Trying alternative old Reddit selectors...');
        const altExpandButton = container.querySelector('.expand, a[onclick*="togglecomment"], [onclick*="collapse"]');
        console.log('🔍 MINIMIZE DEBUG: Alternative expand button found:', altExpandButton);
        
        if (altExpandButton) {
            console.log('🔍 MINIMIZE DEBUG: Clicking alternative expand button');
            altExpandButton.click();
            console.log('✅ MINIMIZE SUCCESS: Minimized comment using alternative expand button');
            return true;
        }
        
        // New Reddit - look for collapse button
        console.log('🔍 MINIMIZE DEBUG: Looking for new Reddit collapse button...');
        const collapseButton = container.querySelector('button[aria-label*="collapse"], button[aria-label*="Collapse"]');
        console.log('🔍 MINIMIZE DEBUG: New Reddit collapse button found:', collapseButton);
        
        if (collapseButton) {
            console.log('🔍 MINIMIZE DEBUG: Clicking new Reddit collapse button');
            collapseButton.click();
            console.log('✅ MINIMIZE SUCCESS: Minimized comment using new Reddit collapse button');
            return true;
        }
        
        // Try more new Reddit selectors
        console.log('🔍 MINIMIZE DEBUG: Trying more new Reddit selectors...');
        const moreCollapseButtons = container.querySelectorAll('button[data-testid*="collapse"], button[title*="collapse"], button[title*="Collapse"]');
        console.log('🔍 MINIMIZE DEBUG: Additional collapse buttons found:', moreCollapseButtons);
        
        if (moreCollapseButtons.length > 0) {
            console.log('🔍 MINIMIZE DEBUG: Clicking first additional collapse button');
            moreCollapseButtons[0].click();
            console.log('✅ MINIMIZE SUCCESS: Minimized comment using additional collapse button');
            return true;
        }
        
        // Fallback - hide the comment body manually
        console.log('🔍 MINIMIZE DEBUG: No native buttons found, trying fallback method...');
        const commentBody = container.querySelector('.usertext-body, .md, [data-testid="comment-content"]');
        console.log('🔍 MINIMIZE DEBUG: Comment body found for fallback:', commentBody);
        
        if (commentBody) {
            console.log('🔍 MINIMIZE DEBUG: Hiding comment body manually');
            commentBody.style.display = 'none';
            
            // Add a small indicator that the comment was auto-minimized
            const indicator = document.createElement('div');
            indicator.className = 'auto-minimized-indicator';
            indicator.style.cssText = `
                font-size: 11px;
                color: #ff9800;
                font-style: italic;
                margin: 4px 0;
                padding: 2px 4px;
                background: rgba(255, 152, 0, 0.1);
                border-radius: 3px;
                display: inline-block;
                cursor: pointer;
            `;
            indicator.textContent = '🤖 Auto-minimized (suspected AI) - Click to expand';
            indicator.onclick = () => {
                console.log('🔍 MINIMIZE DEBUG: User clicked to expand comment');
                commentBody.style.display = '';
                indicator.remove();
            };
            
            commentBody.parentNode.insertBefore(indicator, commentBody);
            console.log('✅ MINIMIZE SUCCESS: Manually minimized comment with fallback method');
            return true;
        }
        
        console.log('❌ MINIMIZE FAILED: No comment body found for fallback');
        return false;
    } catch (error) {
        console.error('❌ MINIMIZE ERROR: Error minimizing comment:', error);
        return false;
    }
}

// Function to apply aggression-based actions to AI-detected comments
function applyAggressionActions(commentElement) {
    console.log('🔍 AGGRESSION DEBUG: Applying aggression actions');
    console.log('🔍 AGGRESSION DEBUG: Current settings object:', currentSettings);
    console.log('🔍 AGGRESSION DEBUG: Aggression level:', currentSettings.aggressionLevel);
    console.log('🔍 AGGRESSION DEBUG: Aggression level type:', typeof currentSettings.aggressionLevel);
    
    if (currentSettings.aggressionLevel === 'low') {
        console.log('🔍 AGGRESSION DEBUG: Low aggression - no additional actions');
        return;
    }
    
    if (currentSettings.aggressionLevel === 'high') {
        console.log('🔍 AGGRESSION DEBUG: High aggression - minimizing comment');
        const minimized = minimizeComment(commentElement);
        if (minimized) {
            console.log('✅ AGGRESSION SUCCESS: Auto-minimized AI comment due to high aggression level');
        } else {
            console.log('❌ AGGRESSION FAILED: Could not minimize AI comment');
        }
    }
}

// Function to extract username from comment element
function extractUsername(commentElement) {
    // Try multiple strategies to find the username, being very specific to avoid profile page confusion
    const container = commentElement.closest('shreddit-profile-comment, shreddit-comment, [data-testid="comment"], .comment');
    if (!container) return null;
    
    // Strategy 1: New Reddit profile comments - look for author name in the comment header
    if (container.tagName === 'SHREDDIT-PROFILE-COMMENT') {
        // Look for the author name specifically within this comment's metadata
        const authorLink = container.querySelector('a[href*="/user/"], a[href*="/u/"]');
        if (authorLink) {
            const href = authorLink.getAttribute('href');
            const username = href.match(/\/u(?:ser)?\/([^\/\?\#]+)/)?.[1];
            if (username && username !== '[deleted]') return username;
        }
    }
    
    // Strategy 2: Old Reddit - look for .author class but ensure it's within the comment's tagline, not the parent post
    const authorEl = container.querySelector('.tagline .author');
    if (authorEl) {
        const text = authorEl.textContent?.trim();
        if (text && text !== '[deleted]' && !text.includes(' ') && text.length > 0) {
            return text;
        }
    }
    
    // Strategy 3: New Reddit - look for author-name attribute on elements within the comment
    const authorNameEl = container.querySelector('[author-name]');
    if (authorNameEl) {
        const authorName = authorNameEl.getAttribute('author-name');
        if (authorName && authorName !== '[deleted]') return authorName;
    }
    
    // Strategy 4: Look for username links but prioritize ones in comment metadata, not post titles
    const userLinks = container.querySelectorAll('a[href*="/user/"], a[href*="/u/"]');
    for (const link of userLinks) {
        // Skip links that are in post titles or other content
        const linkText = link.textContent?.trim();
        const href = link.getAttribute('href');
        const username = href.match(/\/u(?:ser)?\/([^\/\?\#]+)/)?.[1];
        
        // Check if this link is likely the comment author (not in post content)
        const isInCommentMeta = link.closest('.tagline, [id*="poster-info"], .comment-meta, faceplate-hovercard');
        if (username && username !== '[deleted]' && (isInCommentMeta || linkText === username)) {
            return username;
        }
    }
    
    // Strategy 5: Look for data-author attribute
    const dataAuthorEl = container.querySelector('[data-author]');
    if (dataAuthorEl) {
        const author = dataAuthorEl.getAttribute('data-author');
        if (author && author !== '[deleted]') return author;
    }
    
    // Strategy 6: New Reddit specific - look for poster info within the comment
    const posterInfo = container.querySelector('[id*="poster-info"]');
    if (posterInfo) {
        const userLink = posterInfo.querySelector('a[href*="/user/"], a[href*="/u/"]');
        if (userLink) {
            const href = userLink.getAttribute('href');
            const username = href.match(/\/u(?:ser)?\/([^\/\?\#]+)/)?.[1];
            if (username && username !== '[deleted]') return username;
        }
    }
    
    console.log('Could not extract username from comment:', container);
    return null;
}

// Function to process a single comment
async function processComment(commentElement, index = 0) {
    // Get a more reliable comment ID for profile pages
    const container = commentElement.closest('shreddit-profile-comment, shreddit-comment, [data-testid="comment"], .comment');
    let commentId = null;
    
    // Try multiple strategies to get a unique comment ID
    if (container) {
        commentId = container.getAttribute('comment-id') ||
                   container.getAttribute('data-comment-id') ||
                   container.getAttribute('data-testid') ||
                   container.id;
    }
    
    // Fallback to element attributes
    if (!commentId) {
        commentId = commentElement.getAttribute('data-comment-id') || 
                   commentElement.getAttribute('data-testid') || 
                   commentElement.getAttribute('id');
    }
    
    // Last resort: use a hash of the comment content
    if (!commentId) {
        const text = getCommentText(commentElement);
        commentId = `comment_${text.substring(0, 50).replace(/\s+/g, '_')}`;
    }
    
    if (processedComments.has(commentId)) {
        console.log('Skipping already processed comment');
        processedCount++;
        updateProgress(processedCount, totalComments, 'Skipping duplicate comment');
        return;
    }
    processedComments.add(commentId);
    
    // Extract username
    const username = extractUsername(commentElement);
    
    // Check if we've already processed this comment for this user
    if (username && userScoreManager.isCommentProcessed(username, commentId)) {
        console.log(`Comment ${commentId} already processed for user ${username}, using cached result`);
        const cachedResult = userScoreManager.getCachedCommentResult(username, commentId);
        
        // Apply the visual indicators based on cached result
        if (cachedResult.isAI) {
            highlightLLMComment(commentElement);
            
            // Apply aggression-based actions for cached AI comments too
            applyAggressionActions(commentElement);
            
            updateProgress(processedCount + 1, totalComments, `⚠️ Cached AI comment (${Math.round(cachedResult.confidence * 100)}% confidence)`);
        } else {
            markHumanComment(commentElement);
            updateProgress(processedCount + 1, totalComments, `Cached human comment`);
        }
        
        processedCount++;
        return;
    }
    
    const text = getCommentText(commentElement);
    console.log(`Processing comment (${text.length} chars): "${text.substring(0, 100)}..."`);
    
    updateProgress(processedCount, totalComments, `Processing comment ${processedCount + 1}...`);
    
    if (!text) {
        console.log('Skipping comment - no text content');
        processedCount++;
        updateProgress(processedCount, totalComments, 'Skipping empty comment');
        return;
    }
    
    if (text.length < 10) {
        console.log('Skipping comment - too short');
        processedCount++;
        updateProgress(processedCount, totalComments, 'Skipping short comment');
        return;
    }
    
    console.log('Sending comment for classification...');
    updateProgress(processedCount, totalComments, `Analyzing comment ${processedCount + 1}...`);
    
    const result = await classifyComment(text);
    
    processedCount++;
    
    if (!result) {
        console.log('Classification failed or returned null');
        updateProgress(processedCount, totalComments, 'Classification failed');
        return;
    }
    
    console.log('Classification result:', result);
    
    // Check if the highest confidence prediction is 'llm'
    const topPrediction = Array.isArray(result) ? result[0] : result;
    console.log('Top prediction:', topPrediction);
    
    if (topPrediction && topPrediction.label === 'llm') {
        console.log(`LLM detected with confidence: ${topPrediction.score}`);
        if (topPrediction.score > 0.5) {
            highlightLLMComment(commentElement);
            
            // Apply aggression-based actions (minimize/downvote)
            applyAggressionActions(commentElement);
            
            // Update user score for AI comment
            if (username) {
                userScoreManager.updateUserScore(username, commentId, true, topPrediction.score);
            }
            console.log('🚨 LLM comment highlighted:', text.substring(0, 100) + '...', topPrediction);
            updateProgress(processedCount, totalComments, `⚠️ Possible AI comment (${Math.round(topPrediction.score * 100)}% confidence)`);
        } else {
            console.log('LLM confidence too low, not highlighting');
            markHumanComment(commentElement);
            // Update user score for human comment
            if (username) {
                userScoreManager.updateUserScore(username, commentId, false, topPrediction.score);
            }
            updateProgress(processedCount, totalComments, `Human comment (low AI confidence)`);
        }
    } else {
        console.log(`Human comment detected: ${topPrediction?.label} (${topPrediction?.score})`);
        markHumanComment(commentElement);
        // Update user score for human comment
        if (username) {
            userScoreManager.updateUserScore(username, commentId, false, topPrediction?.score || 0.5);
        }
        updateProgress(processedCount, totalComments, `Human comment detected`);
    }
}

// Function to find and process all comments
async function processAllComments() {
    console.log('Starting to process all comments...');
    
    // Reset progress tracking
    processedCount = 0;
    totalComments = 0;
    
    // Create progress widget
    if (progressWidget) {
        progressWidget.remove();
    }
    progressWidget = createProgressWidget();
    
    // Ensure model is ready before processing
    updateProgress(0, 0, 'Loading AI model...');
    const modelReady = await ensureModelReady();
    if (!modelReady) {
        updateProgress(0, 0, 'Failed to load AI model');
        setTimeout(() => {
            if (progressWidget && progressWidget.parentNode) {
                progressWidget.remove();
            }
        }, 3000);
        return;
    }
    
    const variant = detectRedditVariant();
    console.log(`Detected Reddit variant: ${variant}`);
    const selectors = REDDIT_SELECTORS[variant];
    
    // Try multiple selector strategies
    const selectorSets = [selectors, REDDIT_SELECTORS.general];
    
    for (const selectorSet of selectorSets) {
        console.log(`Trying selector: ${selectorSet.comments}`);
        const comments = document.querySelectorAll(selectorSet.comments);
        console.log(`Found ${comments.length} comments with this selector`);
        
        if (comments.length > 0) {
            console.log(`✅ Found ${comments.length} comments using ${variant} selectors`);
            
            // Process all comments found
            totalComments = comments.length;
            console.log(`Processing all ${totalComments} comments...`);
            
            updateProgress(0, totalComments, 'Starting analysis...');
            
            for (let i = 0; i < totalComments; i++) {
                console.log(`Processing comment ${i + 1}/${totalComments}`);
                processComment(comments[i], i); // No delay between comments
            }
            break;
        }
    }
    
    if (totalComments === 0) {
        updateProgress(0, 0, 'No comments found to analyze');
        setTimeout(() => {
            if (progressWidget && progressWidget.parentNode) {
                progressWidget.remove();
            }
        }, 3000);
    }
    
    // Update existing user displays
    setTimeout(() => {
        userScoreManager.updateAllUserDisplays();
    }, 2000);
    
    console.log('Finished queueing comments for processing');
}

// Initial processing - start immediately since we now check model readiness
setTimeout(() => {
    if (currentSettings.autoAnalyze) {
        processAllComments();
    }
}, 1000);

// Update user displays on page load
setTimeout(() => {
    userScoreManager.updateAllUserDisplays();
}, 2000);

// Watch for dynamically loaded content
const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if new nodes contain comments
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const variant = detectRedditVariant();
                    const selectors = REDDIT_SELECTORS[variant];
                    
                    if (node.matches && (
                        node.matches(selectors.comments) || 
                        node.matches(selectors.commentContainer) ||
                        node.querySelector(selectors.comments)
                    )) {
                        shouldProcess = true;
                    }
                }
            });
        }
    });
    
    if (shouldProcess) {
        if (currentSettings.autoAnalyze) {
            setTimeout(processAllComments, 500);
        }
        // Also update user displays when new content loads
        setTimeout(() => {
            userScoreManager.updateAllUserDisplays();
        }, 1000);
    }
});

// Start observing
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Also process when page navigation occurs (for SPA behavior)
let currentUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        processedComments.clear();
        if (currentSettings.autoAnalyze) {
            setTimeout(processAllComments, 2000);
        }
    }
}, 1000);

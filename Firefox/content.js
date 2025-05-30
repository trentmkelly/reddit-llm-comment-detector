// Ensure a consistent way to access the pipeline function
// This handles both browser and Node.js environments for Transformers.js
// For browser extensions, it will use the global `transformers` object
// if you've included the UMD bundle.
// If using ES modules, you'd do: import { pipeline } from '@xenova/transformers';

let pipe;
let modelReady = false;
const modelName = "trentmkelly/slop-detector"; // Or your chosen model

async function initializeModel() {
    try {
        // For browser ESM (if you set up your manifest for module type):
        // const { pipeline } = await import(chrome.runtime.getURL('transformers.min.js'));
        // For UMD bundle loaded via <script> or manifest.json:
        const { pipeline, env } = window.transformers;

        // Configure environment for browser compatibility
        env.allowLocalModels = false; // Disallow local models for security in extensions
        env.useBrowserCache = true;   // Cache models in browser

        console.log("Initializing LLM detection pipeline...");
        pipe = await pipeline('text-classification', modelName, {
            // Progress callback (optional)
            progress_callback: (progress) => {
                console.log(`Loading model: ${Math.round(progress.progress)}%`);
            }
        });
        modelReady = true;
        console.log("LLM detection pipeline ready.");
        // Process existing comments once model is ready
        processAllVisibleComments();
    } catch (error) {
        console.error("Failed to initialize LLM detection pipeline:", error);
        // Optionally, notify the user about the failure
    }
}

async function classifyCommentText(text) {
    if (!modelReady || !pipe) {
        console.log("Model not ready yet.");
        return null;
    }
    if (!text || text.trim().length < 10) { // Basic filter for very short texts
        return null;
    }

    try {
        const result = await pipe(text);
        // Expected output: [{'label': 'SOME_LABEL', 'score': 0.99}]
        // Or potentially: [[{'label': 'NEGATIVE', 'score': 0.99}, {'label': 'POSITIVE', 'score': 0.01}]]
        // Check the actual output structure of your model.
        // For "trentmkelly/slop-detector", it seems to be a binary classifier.
        // Let's assume the primary result is the first element.
        return result[0];
    } catch (error) {
        console.error("Error during classification:", error, "Text:", text.substring(0, 100));
        return null;
    }
}

function addWarningIndicator(commentElement) {
    if (commentElement.querySelector('.llm-warning-indicator')) {
        return; // Warning already added
    }

    const indicator = document.createElement('span');
    indicator.textContent = '⚠️ LLM?';
    indicator.className = 'llm-warning-indicator';
    
    // Try to append it intelligently. For old.reddit, comment actions are a good spot.
    // For new Reddit, it's more complex. We might append it to the comment body itself.
    
    // General approach: find a common place or just prepend/append to the main text block
    const commentBody = commentElement.querySelector('.md p, .RichTextJSON-root, [data-testid="comment"] > div > div:last-child'); // Adjust selectors
    if (commentBody) {
        // For new Reddit, comment actions are usually within a specific div.
        // This needs careful inspection of Reddit's DOM.
        // For simplicity, let's try to append to a metadata line if possible, or start of comment.
        let targetForIndicator = commentElement.querySelector('.tagline, .CommentHeader-meta'); // old.reddit, new reddit meta approx

        if (!targetForIndicator) { // Fallback: append directly to comment body or a prominent child
             targetForIndicator = commentBody.firstChild || commentBody;
        }
        
        if (targetForIndicator && targetForIndicator.parentNode) {
             targetForIndicator.parentNode.insertBefore(indicator, targetForIndicator.nextSibling);
        } else {
            commentBody.prepend(indicator); // Fallback
        }

    } else {
        commentElement.prepend(indicator); // Failsafe
    }
    commentElement.classList.add('llm-comment'); // Add class for border styling
    commentElement.dataset.llmChecked = "true"; // Mark as checked
}

function processComment(commentElement) {
    if (commentElement.dataset.llmChecked === "true") {
        return; // Already processed
    }

    // Extract text. This is highly dependent on Reddit's DOM structure.
    // Needs robust selectors for both old and new Reddit.
    let commentText = '';

    // Selector for new Reddit (this will likely change, very fragile)
    // New Reddit often uses complex, generated class names. Data attributes are more stable.
    // It might also use Shady DOM for comments.
    const newRedditCommentTextSelector = '[data-testid="comment"]'; // A starting point for the comment wrapper
    const newRedditActualTextSelector = 'div[id^="CommentTopMeta--ParentPost--"] + div > div > p, div[data-testid="comment"] div[data-ad-type="text-body"] p';


    // Selector for old.reddit.com
    const oldRedditCommentTextSelector = '.comment .md p';

    let textElement;
    if (commentElement.matches(newRedditCommentTextSelector) || commentElement.closest(newRedditCommentTextSelector)) {
        // For new Reddit, the text might be in various P tags within the comment structure.
        const textParagraphs = commentElement.querySelectorAll(newRedditActualTextSelector);
        textElement = Array.from(textParagraphs).map(p => p.textContent.trim()).join(' ');
    } else if (commentElement.matches(oldRedditCommentTextSelector) || commentElement.closest('.commentarea .comment')) {
        // For old Reddit, it's usually within '.md p'
        const mdElement = commentElement.querySelector('.md');
        if (mdElement) {
           textElement = Array.from(mdElement.querySelectorAll('p')).map(p => p.textContent.trim()).join('\n');
        }
    }

    if (textElement) {
        commentText = textElement;
    } else if (commentElement.textContent) { // Fallback, might grab too much
        commentText = commentElement.textContent;
    }


    if (commentText.trim()) {
        // console.log("Processing comment text:", commentText.substring(0, 100) + "...");
        classifyCommentText(commentText).then(classification => {
            if (classification && classification.label.toLowerCase() === 'llm' && classification.score > 0.75) { // Adjust score threshold as needed
                console.log("LLM detected:", classification, "Comment:", commentText.substring(0, 100));
                addWarningIndicator(commentElement);
            } else {
                 // Mark as checked even if not LLM to avoid re-processing
                 commentElement.dataset.llmChecked = "true";
            }
        }).catch(err => {
            console.error("Error processing comment:", err);
            commentElement.dataset.llmChecked = "true"; // Mark to avoid retrying failing comments
        });
    } else {
        commentElement.dataset.llmChecked = "true"; // Mark as checked if no text found
    }
}

function processAllVisibleComments() {
    if (!modelReady) return;

    console.log("Scanning for comments...");
    // Combined selectors for comments on both old and new Reddit.
    // These will need to be very robust and are subject to change by Reddit.
    // New Reddit's class names are often obfuscated and dynamic.
    // Using data-testid attributes is generally more reliable for new Reddit.
    const commentSelectors = [
        '.comment', // Old Reddit: main comment container
        '[data-testid="comment"]', // New Reddit: comment container (more stable)
        '.Comment', // Another common one on new Reddit (inspect to confirm)
        // Potentially more specific selectors if the above are too broad or miss some.
    ];

    document.querySelectorAll(commentSelectors.join(', ')).forEach(commentEl => {
        // Check if it's a top-level comment and not, for example, a deleted comment placeholder
        // or part of the comment submission form.
        // This logic needs to be refined based on actual DOM.
        const isPotentiallyValidComment = (
            (commentEl.matches('.comment') && commentEl.querySelector('.md')) || // old reddit
            (commentEl.matches('[data-testid="comment"]') && commentEl.querySelector('div[id^="CommentTopMeta"]')) // new reddit
        );

        if (isPotentiallyValidComment && !commentEl.dataset.llmChecked) {
            processComment(commentEl);
        }
    });
}

// Observe DOM changes to detect new comments (infinite scrolling, expanding threads)
const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                // Check if the added node itself is a comment or contains comments
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const commentSelectors = ['.comment', '[data-testid="comment"]', '.Comment']; // Keep consistent
                    if (commentSelectors.some(sel => node.matches(sel))) {
                        processComment(node);
                    }
                    node.querySelectorAll(commentSelectors.join(', ')).forEach(processComment);
                }
            });
        }
    }
});


// --- Main ---
// Wait for the transformers library to be loaded if it's included via manifest.json
// This is a common pattern when using UMD bundles.
function attemptInitialization() {
    if (window.transformers && window.transformers.pipeline) {
        initializeModel();
        // Start observing the document body for added comments
        observer.observe(document.body, { childList: true, subtree: true });
        // Initial scan
        processAllVisibleComments();
    } else {
        console.log("Transformers.js not ready yet, retrying...");
        setTimeout(attemptInitialization, 500); // Retry after a short delay
    }
}

// Start the process
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attemptInitialization);
} else {
    attemptInitialization();
}

// Add a listener for messages from a popup or background script if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "recheckComments") {
        console.log("Re-checking comments due to request.");
        // Reset checked status to reprocess (optional, could be resource intensive)
        // document.querySelectorAll('[data-llm-checked="true"]').forEach(el => delete el.dataset.llmChecked);
        processAllVisibleComments();
        sendResponse({status: "Re-check initiated"});
    }
    return true; // Indicates you wish to send a response asynchronously
});

console.log("Reddit LLM Comment Detector content script loaded.");
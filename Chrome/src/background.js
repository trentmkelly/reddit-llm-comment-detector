// background.js - Handles requests from the UI, runs the model, then sends back a response

import { pipeline } from '@huggingface/transformers';

// Configuration storage key (same as popup)
const SETTINGS_KEY = 'reddit-ai-detector-settings';
const DEFAULT_MODEL = 'trentmkelly/slop-detector-mini-2';

class PipelineSingleton {
    static task = 'text-classification';
    static model = DEFAULT_MODEL;
    static instance = null;
    static isLoading = false;
    static loadingPromise = null;

    static async loadModelFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get([SETTINGS_KEY], (result) => {
                const settings = result[SETTINGS_KEY];
                const selectedModel = settings?.selectedModel || DEFAULT_MODEL;
                this.model = selectedModel;
                console.log('Background: Model set to:', selectedModel);
                resolve(selectedModel);
            });
        });
    }

    static async getInstance(progress_callback = null) {
        // Load current model from storage
        await this.loadModelFromStorage();
        
        // If already loaded with the correct model, return it
        if (this.instance && this.currentModel === this.model) {
            return this.instance;
        }
        
        // If model changed, reset instance
        if (this.instance && this.currentModel !== this.model) {
            console.log('Background: Model changed, resetting instance');
            this.instance = null;
            this.currentModel = null;
        }

        // If currently loading, wait for the existing load
        if (this.isLoading && this.loadingPromise) {
            console.log('Background: Waiting for existing model load...');
            return this.loadingPromise;
        }

        // Start loading
        this.isLoading = true;
        this.currentModel = this.model;
        console.log('Background: Starting model load for:', this.model);
        
        this.loadingPromise = pipeline(this.task, this.model, { progress_callback })
            .then(instance => {
                console.log('Background: Model loaded successfully:', this.model);
                this.instance = instance;
                this.isLoading = false;
                return instance;
            })
            .catch(error => {
                console.error('Background: Model loading failed:', error);
                this.isLoading = false;
                this.loadingPromise = null;
                this.currentModel = null;
                throw error;
            });

        return this.loadingPromise;
    }
    
    static resetInstance() {
        console.log('Background: Resetting pipeline instance');
        this.instance = null;
        this.currentModel = null;
        this.isLoading = false;
        this.loadingPromise = null;
    }
}

// Create generic classify function, which will be reused for the different types of events.
const classify = async (text) => {
    try {
        console.log('Background: Starting classification for text:', text.substring(0, 100) + '...');
        
        // Get the pipeline instance. This will load and build the model when run for the first time.
        console.log('Background: Getting pipeline instance...');
        let model = await PipelineSingleton.getInstance((data) => {
            // You can track the progress of the pipeline creation here.
            console.log('Background: Model loading progress:', data);
        });

        console.log('Background: Pipeline ready, running classification...');
        // Actually run the model on the input text
        let result = await model(text);
        console.log('Background: Classification result:', result);
        return result;
    } catch (error) {
        console.error('Background: Error in classify function:', error);
        throw error;
    }
};

////////////////////// 1. Context Menus //////////////////////
//
// Add a listener to create the initial context menu items,
// context menu items only need to be created at runtime.onInstalled
chrome.runtime.onInstalled.addListener(function () {
    // Register a context menu item that will only show up for selection text.
    chrome.contextMenus.create({
        id: 'classify-selection',
        title: 'Classify "%s"',
        contexts: ['selection'],
    });
});

// Perform inference when the user clicks a context menu
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Ignore context menu clicks that are not for classifications (or when there is no input)
    if (info.menuItemId !== 'classify-selection' || !info.selectionText) return;

    // Perform classification on the selected text
    let result = await classify(info.selectionText);

    // Do something with the result
    chrome.scripting.executeScript({
        target: { tabId: tab.id },    // Run in the tab that the user clicked in
        args: [result],               // The arguments to pass to the function
        function: (result) => {       // The function to run
            // NOTE: This function is run in the context of the web page, meaning that `document` is available.
            console.log('result', result)
            console.log('document', document)
        },
    });
});
//////////////////////////////////////////////////////////////

////////////////////// 2. Message Events /////////////////////
// 
// Listen for messages from the UI, process it, and send the result back.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background: Received message from', sender.tab ? `tab ${sender.tab.id}` : 'extension', message);
    
    if (message.action === 'modelChanged') {
        console.log('Background: Model changed to:', message.model);
        PipelineSingleton.resetInstance();
        return false;
    }
    
    if (message.action !== 'classify') {
        console.log('Background: Ignoring non-classify message');
        return false; // Not handling this message
    }

    // Run model prediction asynchronously
    (async function () {
        try {
            console.log('Background: Starting async classification...');
            // Perform classification
            let result = await classify(message.text);
            console.log('Background: Classification complete, sending response:', result);

            // Send response back to UI
            sendResponse(result);
        } catch (error) {
            console.error('Background: Error during classification:', error);
            // Send error response
            sendResponse({ error: error.message });
        }
    })();

    // return true to indicate we will send a response asynchronously
    // see https://stackoverflow.com/a/46628145 for more information
    return true;
});
//////////////////////////////////////////////////////////////


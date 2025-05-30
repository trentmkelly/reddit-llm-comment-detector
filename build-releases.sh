#!/bin/bash

# Reddit LLM Comment Detector - Build Script
# Builds Chrome and Firefox extensions and packages them as zip files

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CHROME_DIR="Chrome"
FIREFOX_DIR="Firefox"
RELEASES_DIR="releases"

# Create releases directory if it doesn't exist
mkdir -p "$RELEASES_DIR"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to get version from package.json
get_version() {
    if [ -f "$CHROME_DIR/package.json" ]; then
        version=$(grep '"version"' "$CHROME_DIR/package.json" | cut -d'"' -f4)
        echo "${version:-1.0.0}"
    else
        echo "1.0.0"
    fi
}

# Function to build a single extension
build_extension() {
    local ext_dir="$1"
    local browser="$2"
    local zip_name="$3"
    
    print_status "Building $browser extension..."
    
    # Check if directory exists
    if [ ! -d "$ext_dir" ]; then
        print_error "$browser directory not found: $ext_dir"
        return 1
    fi
    
    # Enter extension directory
    cd "$ext_dir"
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies for $browser..."
        npm install
    fi
    
    # Build the extension
    print_status "Building $browser extension..."
    npm run build
    
    # Check if build directory exists
    if [ ! -d "build" ]; then
        print_error "Build directory not found after building $browser extension"
        cd ..
        return 1
    fi
    
    # Return to root directory
    cd ..
    
    # Create zip file
    print_status "Creating zip file: $zip_name"
    cd "$ext_dir/build"
    zip -r "../../$RELEASES_DIR/$zip_name" . -x "*.DS_Store" "*/__pycache__/*" "*/node_modules/*"
    cd ../..
    
    # Get file size
    local size=$(du -h "$RELEASES_DIR/$zip_name" | cut -f1)
    print_success "Created $zip_name ($size)"
}

# Main build function
main() {
    echo "🚀 Building Reddit LLM Comment Detector extensions..."
    echo
    
    # Get version
    VERSION=$(get_version)
    print_status "Version: $VERSION"
    echo
    
    # Clean releases directory
    rm -f "$RELEASES_DIR"/*.zip
    
    local success_count=0
    local total_count=0
    
    # Build Chrome extension
    if [ -d "$CHROME_DIR" ]; then
        total_count=$((total_count + 1))
        CHROME_ZIP="reddit-llm-comment-detector-chrome-v${VERSION}.zip"
        if build_extension "$CHROME_DIR" "Chrome" "$CHROME_ZIP"; then
            success_count=$((success_count + 1))
        fi
        echo
    else
        print_warning "Chrome directory not found: $CHROME_DIR"
    fi
    
    # Build Firefox extension
    if [ -d "$FIREFOX_DIR" ]; then
        total_count=$((total_count + 1))
        FIREFOX_ZIP="reddit-llm-comment-detector-firefox-v${VERSION}.zip"
        if build_extension "$FIREFOX_DIR" "Firefox" "$FIREFOX_ZIP"; then
            success_count=$((success_count + 1))
        fi
        echo
    else
        print_warning "Firefox directory not found: $FIREFOX_DIR"
    fi
    
    # Print summary
    echo "=============================================="
    if [ $success_count -eq $total_count ] && [ $total_count -gt 0 ]; then
        print_success "Build completed successfully!"
        echo
        print_status "Generated files:"
        ls -la "$RELEASES_DIR"/*.zip 2>/dev/null || echo "No zip files found"
        echo
        print_status "📁 Files are ready for distribution in the releases/ directory"
        print_status "🔗 Upload these files to GitHub releases or distribute directly to users"
    else
        print_error "Build failed or incomplete ($success_count/$total_count succeeded)"
        exit 1
    fi
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Reddit LLM Comment Detector - Build Script"
        echo
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --chrome       Build only Chrome extension"
        echo "  --firefox      Build only Firefox extension"
        echo
        echo "Examples:"
        echo "  $0             # Build both extensions"
        echo "  $0 --chrome    # Build only Chrome extension"
        echo "  $0 --firefox   # Build only Firefox extension"
        exit 0
        ;;
    --chrome)
        VERSION=$(get_version)
        CHROME_ZIP="reddit-llm-comment-detector-chrome-v${VERSION}.zip"
        rm -f "$RELEASES_DIR/$CHROME_ZIP"
        build_extension "$CHROME_DIR" "Chrome" "$CHROME_ZIP"
        ;;
    --firefox)
        VERSION=$(get_version)
        FIREFOX_ZIP="reddit-llm-comment-detector-firefox-v${VERSION}.zip"
        rm -f "$RELEASES_DIR/$FIREFOX_ZIP"
        build_extension "$FIREFOX_DIR" "Firefox" "$FIREFOX_ZIP"
        ;;
    "")
        main
        ;;
    *)
        print_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
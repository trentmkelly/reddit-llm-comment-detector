#!/bin/bash

set -e

echo "Building Reddit AI Comment Detector extension..."

echo "Running npm build..."
npm run build

echo "Creating extension zip package..."
cd build
zip -r ../reddit-ai-comment-detector.zip . ../.gitignore
cd ..

echo "Extension built and packaged successfully!"
echo "Package: reddit-ai-comment-detector.zip"
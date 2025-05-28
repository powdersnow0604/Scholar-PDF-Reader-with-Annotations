// Helper functions for showing status messages
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = type;
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

function showSuccess(message) {
    showStatus(message, 'success');
}

function showError(message) {
    showStatus(message, 'error');
}

// Export functionality
document.getElementById('exportBtn').addEventListener('click', async () => {
    try {
        // Get all data from chrome.storage.local
        chrome.storage.local.get(null, (items) => {
            if (chrome.runtime.lastError) {
                showError('Error exporting annotations: ' + chrome.runtime.lastError.message);
                return;
            }

            // Create a JSON file
            const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Create a temporary link and click it to download the file
            const a = document.createElement('a');
            a.href = url;
            a.download = 'annotations-backup-' + new Date().toLocaleString('en-GB').replace(/[:/]/g, '-').replace(/, /g, '_') + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showSuccess('Annotations exported successfully!');
        });
    } catch (error) {
        showError('Error exporting annotations: ' + error.message);
    }
});

// Import functionality
document.getElementById('importInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // First, verify the data structure
            if (typeof data !== 'object') {
                throw new Error('Invalid backup file format');
            }

            // Clear existing annotations
            await new Promise((resolve, reject) => {
                chrome.storage.local.clear(() => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });

            // Import new annotations
            await new Promise((resolve, reject) => {
                chrome.storage.local.set(data, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });

            showSuccess('Annotations imported successfully!');
            
            // Reset the file input
            event.target.value = '';
        } catch (error) {
            showError('Error importing annotations: ' + error.message);
        }
    };

    reader.onerror = () => {
        showError('Error reading the file');
    };

    reader.readAsText(file);
});

// Merge functionality
document.getElementById('mergeInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const importData = JSON.parse(e.target.result);
            
            // First, verify the data structure
            if (typeof importData !== 'object') {
                throw new Error('Invalid backup file format');
            }

            // Get existing annotations
            const existingData = await new Promise((resolve, reject) => {
                chrome.storage.local.get(null, (items) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(items);
                    }
                });
            });

            // Merge the data
            const mergedData = mergeAnnotations(existingData, importData);

            // Save the merged data
            await new Promise((resolve, reject) => {
                chrome.storage.local.set(mergedData, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });

            showSuccess('Annotations merged successfully!');
            
            // Reset the file input
            event.target.value = '';
        } catch (error) {
            showError('Error merging annotations: ' + error.message);
        }
    };

    reader.onerror = () => {
        showError('Error reading the file');
    };

    reader.readAsText(file);
});

// Function to merge annotations intelligently
function mergeAnnotations(existingData, importData) {
    const mergedData = { ...existingData };
    
    // Iterate through each PDF URL in the import data
    for (const [pdfUrl, importAnnotations] of Object.entries(importData)) {
        if (Array.isArray(importAnnotations)) {
            // This is annotation data for a PDF
            const existingAnnotations = mergedData[pdfUrl] || [];
            const existingIds = new Set(existingAnnotations.map(ann => ann.id));
            
            // Add new annotations that don't conflict with existing ones
            const newAnnotations = importAnnotations.filter(ann => !existingIds.has(ann.id));
            
            // Handle ID conflicts by generating new IDs for conflicting annotations
            const conflictingAnnotations = importAnnotations.filter(ann => existingIds.has(ann.id));
            const resolvedConflicts = conflictingAnnotations.map(ann => ({
                ...ann,
                id: generateUniqueId(existingIds, ann.id)
            }));
            
            // Update the existing IDs set with new IDs
            resolvedConflicts.forEach(ann => existingIds.add(ann.id));
            
            // Combine all annotations
            mergedData[pdfUrl] = [
                ...existingAnnotations,
                ...newAnnotations,
                ...resolvedConflicts
            ];
        } else {
            // This might be other extension data, merge carefully
            if (!mergedData.hasOwnProperty(pdfUrl)) {
                mergedData[pdfUrl] = importData[pdfUrl];
            }
            // If it exists, keep the existing data (prioritize current data for non-annotation entries)
        }
    }
    
    return mergedData;
}

// Function to generate a unique ID when there's a conflict
function generateUniqueId(existingIds, originalId) {
    let counter = 1;
    let newId = `${originalId}-merged-${counter}`;
    
    while (existingIds.has(newId)) {
        counter++;
        newId = `${originalId}-merged-${counter}`;
    }
    
    return newId;
}